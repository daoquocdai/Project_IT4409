package call

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

const groupCallSelect = `SELECT gc.id,gc.external_id::text,t.external_id::text,creator.external_id::text,creator.username,gc.media_type,gc.status,gc.version,gc.created_at,gc.ended_at
 FROM group_calls gc JOIN threads t ON t.id=gc.thread_id JOIN users creator ON creator.id=gc.created_by`

func scanGroupCall(row pgx.Row) (int64, GroupCall, error) {
	var internal int64
	var value GroupCall
	err := row.Scan(&internal, &value.ID, &value.ThreadID, &value.CreatedBy, &value.CreatorName, &value.MediaType, &value.Status, &value.Version, &value.CreatedAt, &value.EndedAt)
	return internal, value, err
}

func loadParticipants(ctx context.Context, q interface{ Query(context.Context, string, ...any) (pgx.Rows, error) }, internal int64) ([]GroupParticipant, error) {
	rows, err := q.Query(ctx, `SELECT s.external_id::text,u.external_id::text,u.username,s.status FROM group_call_sessions s JOIN users u ON u.id=s.user_id WHERE s.call_id=$1 AND s.status IN ('joining','ready') ORDER BY s.joined_at,s.id`, internal)
	if err != nil { return nil, err }
	defer rows.Close()
	items := []GroupParticipant{}
	for rows.Next() { var item GroupParticipant; if err = rows.Scan(&item.SessionID,&item.UserID,&item.Name,&item.Status); err != nil{return nil,err}; items=append(items,item) }
	return items, rows.Err()
}

func (r *Repository) CreateGroupCall(ctx context.Context, actor, thread, media string) (GroupCall, bool, error) {
	if media != "audio" && media != "video" { return GroupCall{}, false, ErrInvalid }
	tx, err := r.pool.Begin(ctx); if err != nil{return GroupCall{},false,err}; defer tx.Rollback(ctx)
	var threadID, actorID int64
	err = tx.QueryRow(ctx, `SELECT t.id,u.id FROM threads t JOIN users u ON u.external_id=$1 JOIN participants p ON p.thread_id=t.id AND p.user_id=u.id AND p.left_seq IS NULL WHERE t.external_id=$2 AND t.kind='group' FOR UPDATE OF t`,actor,thread).Scan(&threadID,&actorID)
	if errors.Is(err,pgx.ErrNoRows){return GroupCall{},false,ErrForbidden}; if err!=nil{return GroupCall{},false,err}
	internal,value,err:=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.thread_id=$1 AND gc.status='open' FOR UPDATE`,threadID))
	created:=false
	if errors.Is(err,pgx.ErrNoRows){
		err=tx.QueryRow(ctx,`INSERT INTO group_calls(thread_id,created_by,media_type) VALUES($1,$2,$3) RETURNING id`,threadID,actorID,media).Scan(&internal); if err!=nil{return GroupCall{},false,err}
		internal,value,err=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.id=$1`,internal)); if err!=nil{return GroupCall{},false,err}
		_,err=tx.Exec(ctx,`INSERT INTO group_call_events(call_id,event_type) VALUES($1,'group-call.started')`,internal); if err!=nil{return GroupCall{},false,err}; created=true
	} else if err!=nil{return GroupCall{},false,err}
	value.Participants,err=loadParticipants(ctx,tx,internal); if err!=nil{return GroupCall{},false,err}
	if err=tx.Commit(ctx);err!=nil{return GroupCall{},false,err}; return value,created,nil
}

func (r *Repository) ActiveGroupCall(ctx context.Context, actor, thread string) (GroupCall,error){
	internal,value,err:=scanGroupCall(r.pool.QueryRow(ctx,groupCallSelect+` JOIN participants p ON p.thread_id=gc.thread_id AND p.left_seq IS NULL JOIN users me ON me.id=p.user_id WHERE t.external_id=$1 AND me.external_id=$2 AND gc.status='open'`,thread,actor))
	if errors.Is(err,pgx.ErrNoRows){return GroupCall{},ErrNotFound}; if err!=nil{return GroupCall{},err}; value.Participants,err=loadParticipants(ctx,r.pool,internal); return value,err
}

func (r *Repository) GetGroupCall(ctx context.Context, actor, id string)(GroupCall,error){
	internal,value,err:=scanGroupCall(r.pool.QueryRow(ctx,groupCallSelect+` JOIN participants p ON p.thread_id=gc.thread_id AND p.left_seq IS NULL JOIN users me ON me.id=p.user_id WHERE gc.external_id=$1 AND me.external_id=$2`,id,actor))
	if errors.Is(err,pgx.ErrNoRows){return GroupCall{},ErrNotFound}; if err!=nil{return GroupCall{},err}; value.Participants,err=loadParticipants(ctx,r.pool,internal); return value,err
}

func (r *Repository) JoinGroupCall(ctx context.Context, actor,id,device string)(GroupJoin,error){
	tx,err:=r.pool.Begin(ctx);if err!=nil{return GroupJoin{},err};defer tx.Rollback(ctx)
	internal,value,err:=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.external_id=$1 FOR UPDATE`,id));if errors.Is(err,pgx.ErrNoRows){return GroupJoin{},ErrNotFound};if err!=nil{return GroupJoin{},err};if value.Status!="open"{return GroupJoin{},ErrConflict}
	var userID int64;err=tx.QueryRow(ctx,`SELECT u.id FROM users u JOIN participants p ON p.user_id=u.id JOIN group_calls gc ON gc.thread_id=p.thread_id WHERE u.external_id=$1 AND gc.id=$2 AND p.left_seq IS NULL`,actor,internal).Scan(&userID);if errors.Is(err,pgx.ErrNoRows){return GroupJoin{},ErrForbidden};if err!=nil{return GroupJoin{},err}
	var sessionID,activeDevice string
	err=tx.QueryRow(ctx,`SELECT external_id::text,device_id::text FROM group_call_sessions WHERE call_id=$1 AND user_id=$2 AND status IN ('joining','ready')`,internal,userID).Scan(&sessionID,&activeDevice)
	if err==nil { if activeDevice!=device{return GroupJoin{},ErrBusy}; _,err=tx.Exec(ctx,`UPDATE group_call_sessions SET last_seen_at=NOW() WHERE external_id=$1`,sessionID) } else if errors.Is(err,pgx.ErrNoRows) {
		var count int; if err=tx.QueryRow(ctx,`SELECT COUNT(*) FROM group_call_sessions WHERE call_id=$1 AND status IN ('joining','ready')`,internal).Scan(&count);err!=nil{return GroupJoin{},err};if count>=4{return GroupJoin{},ErrFull}
		ct,execErr:=tx.Exec(ctx,`INSERT INTO active_call_users(user_id,group_call_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,userID,internal);if execErr!=nil{return GroupJoin{},execErr};if ct.RowsAffected()!=1{return GroupJoin{},ErrBusy}
		err=tx.QueryRow(ctx,`INSERT INTO group_call_sessions(call_id,user_id,device_id) VALUES($1,$2,$3) RETURNING external_id::text`,internal,userID,device).Scan(&sessionID);if err==nil{_,err=tx.Exec(ctx,`UPDATE group_calls SET version=version+1,empty_since=NULL WHERE id=$1`,internal)}
	} 
	if err!=nil{return GroupJoin{},err}; internal,value,err=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.id=$1`,internal));if err!=nil{return GroupJoin{},err};value.Participants,err=loadParticipants(ctx,tx,internal);if err!=nil{return GroupJoin{},err};if err=tx.Commit(ctx);err!=nil{return GroupJoin{},err};return GroupJoin{GroupCall:value,SelfSessionID:sessionID},nil
}

func (r *Repository) ReadyGroupCall(ctx context.Context,actor,id,session,device string)(GroupJoin,error){
	tx,err:=r.pool.Begin(ctx);if err!=nil{return GroupJoin{},err};defer tx.Rollback(ctx)
	var internal int64;var status string;err=tx.QueryRow(ctx,`SELECT gc.id,gc.status FROM group_calls gc WHERE gc.external_id=$1 FOR UPDATE`,id).Scan(&internal,&status);if errors.Is(err,pgx.ErrNoRows){return GroupJoin{},ErrNotFound};if err!=nil{return GroupJoin{},err};if status!="open"{return GroupJoin{},ErrConflict}
	var sessionStatus string;err=tx.QueryRow(ctx,`SELECT s.status FROM group_call_sessions s JOIN users u ON u.id=s.user_id WHERE s.external_id=$1 AND s.call_id=$2 AND u.external_id=$3 AND s.device_id=$4 AND s.status IN ('joining','ready')`,session,internal,actor,device).Scan(&sessionStatus);if errors.Is(err,pgx.ErrNoRows){return GroupJoin{},ErrForbidden};if err!=nil{return GroupJoin{},err}
	if sessionStatus=="joining"{_,err=tx.Exec(ctx,`UPDATE group_call_sessions SET status='ready',last_seen_at=NOW() WHERE external_id=$1`,session);if err==nil{_,err=tx.Exec(ctx,`UPDATE group_calls SET version=version+1 WHERE id=$1`,internal)};if err==nil{payload,_:=json.Marshal(map[string]string{"session_id":session});_,err=tx.Exec(ctx,`INSERT INTO group_call_events(call_id,event_type,payload) VALUES($1,'group-call.participant-ready',$2)`,internal,payload)}}else{_,err=tx.Exec(ctx,`UPDATE group_call_sessions SET last_seen_at=NOW() WHERE external_id=$1`,session)};if err!=nil{return GroupJoin{},err}
	internal,value,err:=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.id=$1`,internal));if err!=nil{return GroupJoin{},err};value.Participants,err=loadParticipants(ctx,tx,internal);if err!=nil{return GroupJoin{},err};if err=tx.Commit(ctx);err!=nil{return GroupJoin{},err};return GroupJoin{GroupCall:value,SelfSessionID:session},nil
}

func (r *Repository) LeaveGroupCall(ctx context.Context,actor,id,session,device string)(GroupCall,error){return r.groupExit(ctx,actor,id,session,device,false)}
func (r *Repository) EndGroupCall(ctx context.Context,actor,id string)(GroupCall,error){return r.groupExit(ctx,actor,id,"","",true)}
func (r *Repository) groupExit(ctx context.Context,actor,id,session,device string,end bool)(GroupCall,error){
	tx,err:=r.pool.Begin(ctx);if err!=nil{return GroupCall{},err};defer tx.Rollback(ctx);internal,value,err:=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.external_id=$1 FOR UPDATE`,id));if errors.Is(err,pgx.ErrNoRows){return GroupCall{},ErrNotFound};if err!=nil{return GroupCall{},err};if value.Status=="ended"{value.Participants=[]GroupParticipant{};return value,tx.Commit(ctx)}
	if end { if actor!=value.CreatedBy{return GroupCall{},ErrForbidden};_,err=tx.Exec(ctx,`UPDATE group_call_sessions SET status='left',left_at=NOW() WHERE call_id=$1 AND status IN ('joining','ready')`,internal);if err==nil{_,err=tx.Exec(ctx,`DELETE FROM active_call_users WHERE group_call_id=$1`,internal)};if err==nil{_,err=tx.Exec(ctx,`UPDATE group_calls SET status='ended',ended_at=NOW(),version=version+1 WHERE id=$1`,internal)};if err==nil{var seq,creatorID int64;err=tx.QueryRow(ctx,`UPDATE threads SET last_seq=last_seq+1 WHERE id=(SELECT thread_id FROM group_calls WHERE id=$1) RETURNING last_seq`,internal).Scan(&seq);if err==nil{err=tx.QueryRow(ctx,`SELECT created_by FROM group_calls WHERE id=$1`,internal).Scan(&creatorID)};if err==nil{_,err=tx.Exec(ctx,`INSERT INTO messages(thread_id,sender_id,seq,kind,content_format,content,metadata) SELECT thread_id,$2,$3,'system','plaintext','Cuộc gọi nhóm đã kết thúc',jsonb_build_object('group_call_id',external_id::text,'call_media_type',media_type,'call_end_reason','completed') FROM group_calls WHERE id=$1`,internal,creatorID,seq)}};if err==nil{_,err=tx.Exec(ctx,`INSERT INTO group_call_events(call_id,event_type) VALUES($1,'group-call.ended')`,internal)}
	} else { var userID int64;err=tx.QueryRow(ctx,`SELECT s.user_id FROM group_call_sessions s JOIN users u ON u.id=s.user_id WHERE s.external_id=$1 AND s.call_id=$2 AND u.external_id=$3 AND s.device_id=$4 AND s.status IN ('joining','ready')`,session,internal,actor,device).Scan(&userID);if errors.Is(err,pgx.ErrNoRows){return GroupCall{},ErrForbidden};if err==nil{_,err=tx.Exec(ctx,`UPDATE group_call_sessions SET status='left',left_at=NOW() WHERE external_id=$1`,session)};if err==nil{_,err=tx.Exec(ctx,`DELETE FROM active_call_users WHERE user_id=$1 AND group_call_id=$2`,userID,internal)};if err==nil{_,err=tx.Exec(ctx,`UPDATE group_calls SET version=version+1,empty_since=CASE WHEN NOT EXISTS(SELECT 1 FROM group_call_sessions WHERE call_id=$1 AND status IN ('joining','ready')) THEN NOW() ELSE NULL END WHERE id=$1`,internal)};if err==nil{payload,_:=json.Marshal(map[string]string{"session_id":session});_,err=tx.Exec(ctx,`INSERT INTO group_call_events(call_id,event_type,payload) VALUES($1,'group-call.participant-left',$2)`,internal,payload)} }
	if err!=nil{return GroupCall{},err};internal,value,err=scanGroupCall(tx.QueryRow(ctx,groupCallSelect+` WHERE gc.id=$1`,internal));if err!=nil{return GroupCall{},err};value.Participants,err=loadParticipants(ctx,tx,internal);if err!=nil{return GroupCall{},err};if err=tx.Commit(ctx);err!=nil{return GroupCall{},err};return value,nil
}

func (r *Repository) ValidateGroupSignal(ctx context.Context,actor,id,source,target,device string)(GroupCall,string,error){
	value,err:=r.GetGroupCall(ctx,actor,id);if err!=nil{return GroupCall{},"",err};if value.Status!="open"{return GroupCall{},"",ErrConflict};var targetUser string
	err=r.pool.QueryRow(ctx,`SELECT target.external_id::text FROM group_calls gc JOIN group_call_sessions source ON source.call_id=gc.id JOIN users me ON me.id=source.user_id JOIN group_call_sessions destination ON destination.call_id=gc.id JOIN users target ON target.id=destination.user_id WHERE gc.external_id=$1 AND gc.status='open' AND source.external_id=$2 AND source.status='ready' AND me.external_id=$3 AND source.device_id=$4 AND destination.external_id=$5 AND destination.status='ready'`,id,source,actor,device,target).Scan(&targetUser)
	if errors.Is(err,pgx.ErrNoRows){return GroupCall{},"",ErrForbidden};return value,targetUser,err
}

func (r *Repository) PendingGroups(ctx context.Context)([]GroupEvent,error){
	rows,err:=r.pool.Query(ctx,`SELECT e.id::text,e.event_type,gc.id,gc.external_id::text,t.external_id::text,creator.external_id::text,creator.username,gc.media_type,gc.status,gc.version,gc.created_at,gc.ended_at,e.payload,ARRAY(SELECT u.external_id::text FROM participants p JOIN users u ON u.id=p.user_id WHERE p.thread_id=gc.thread_id AND p.left_seq IS NULL) FROM group_call_events e JOIN group_calls gc ON gc.id=e.call_id JOIN threads t ON t.id=gc.thread_id JOIN users creator ON creator.id=gc.created_by WHERE e.published_at IS NULL ORDER BY e.created_at LIMIT 100`);if err!=nil{return nil,err};defer rows.Close();items:=[]GroupEvent{}
	for rows.Next(){var item GroupEvent;var internal int64;var raw []byte;if err=rows.Scan(&item.ID,&item.Type,&internal,&item.Call.ID,&item.Call.ThreadID,&item.Call.CreatedBy,&item.Call.CreatorName,&item.Call.MediaType,&item.Call.Status,&item.Call.Version,&item.Call.CreatedAt,&item.Call.EndedAt,&raw,&item.Recipients);err!=nil{return nil,err};item.Call.Participants,err=loadParticipants(ctx,r.pool,internal);if err!=nil{return nil,err};items=append(items,item)};return items,rows.Err()
}
func(r *Repository) PublishedGroup(ctx context.Context,id string)error{_,err:=r.pool.Exec(ctx,`UPDATE group_call_events SET published_at=NOW() WHERE id=$1`,id);return err}

func(r *Repository) ExpireGroups(ctx context.Context)error{_,err:=r.pool.Exec(ctx,`WITH stale AS (UPDATE group_call_sessions SET status='left',left_at=NOW() WHERE status='joining' AND last_seen_at<NOW()-INTERVAL '45 seconds' RETURNING call_id,user_id), freed AS (DELETE FROM active_call_users a USING stale s WHERE a.user_id=s.user_id AND a.group_call_id=s.call_id), marked AS (UPDATE group_calls gc SET empty_since=COALESCE(gc.empty_since,NOW()) WHERE gc.status='open' AND NOT EXISTS(SELECT 1 FROM group_call_sessions s WHERE s.call_id=gc.id AND s.status IN ('joining','ready')) RETURNING gc.id), closing AS (UPDATE group_calls SET status='ended',ended_at=NOW(),version=version+1 WHERE status='open' AND empty_since<NOW()-INTERVAL '30 seconds' RETURNING id) INSERT INTO group_call_events(call_id,event_type) SELECT id,'group-call.ended' FROM closing`);return err}
