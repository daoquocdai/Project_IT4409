package config

import (
	"errors"
	"net/url"
	"os"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

type Config struct {
	HTTPAddress   string        `yaml:"http_address"`
	WSAddress     string        `yaml:"ws_address"`
	WSPublicURL   string        `yaml:"ws_public_url"`
	WSOrigins     []string      `yaml:"ws_allowed_origins"`
	WSTicketTTL   time.Duration `yaml:"ws_ticket_ttl"`
	DatabaseURL   string        `yaml:"database_url"`
	AttachmentDir string        `yaml:"attachment_dir"`
	Auth          AuthConfig    `yaml:"auth"`
	Redis         RedisConfig   `yaml:"redis"`
}

// LoadGateway reads the shared config without requiring a PostgreSQL URL or API port.
// Both processes therefore use the same JWT secret and Redis stream.
func LoadGateway(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	applyEnvironment(&cfg)
	applyWSDefaults(&cfg)
	if cfg.WSAddress == cfg.HTTPAddress {
		return Config{}, errors.New("ws_address must differ from http_address")
	}
	if err := validateShared(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

type AuthConfig struct {
	JWTSecret string        `yaml:"jwt_secret"`
	JWTTTL    time.Duration `yaml:"jwt_ttl"`
}

type RedisConfig struct {
	Address        string        `yaml:"address"`
	Password       string        `yaml:"password"`
	Database       int           `yaml:"database"`
	Stream         string        `yaml:"stream"`
	PublishTimeout time.Duration `yaml:"publish_timeout"`
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	applyEnvironment(&cfg)
	applyWSDefaults(&cfg)

	if cfg.HTTPAddress == "" {
		return Config{}, errors.New("http_address is required")
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("database_url is required")
	}
	if err := validateShared(cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

// applyEnvironment lets containers override the hostnames and secrets from the
// development YAML without generating or modifying a config file at runtime.
func applyEnvironment(cfg *Config) {
	if value := strings.TrimSpace(os.Getenv("MINI_HERMES_DATABASE_URL")); value != "" {
		cfg.DatabaseURL = value
	}
	if value := strings.TrimSpace(os.Getenv("MINI_HERMES_REDIS_ADDRESS")); value != "" {
		cfg.Redis.Address = value
	}
	if value := os.Getenv("MINI_HERMES_REDIS_PASSWORD"); value != "" {
		cfg.Redis.Password = value
	}
	if value := strings.TrimSpace(os.Getenv("MINI_HERMES_JWT_SECRET")); value != "" {
		cfg.Auth.JWTSecret = value
	}
	if value := strings.TrimSpace(os.Getenv("ATTACHMENT_DIR")); value != "" {
		cfg.AttachmentDir = value
	}
}

func validateShared(cfg Config) error {
	parsedURL, err := url.Parse(cfg.WSPublicURL)
	if err != nil || (parsedURL.Scheme != "ws" && parsedURL.Scheme != "wss") || parsedURL.Host == "" || parsedURL.User != nil || parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		return errors.New("ws_public_url must be a ws/wss URL without credentials, query or fragment")
	}
	if cfg.WSTicketTTL < time.Second || cfg.WSTicketTTL > time.Minute {
		return errors.New("ws_ticket_ttl must be between one second and one minute")
	}
	if cfg.Auth.JWTSecret == "" {
		return errors.New("auth.jwt_secret is required")
	}
	if cfg.Auth.JWTTTL < time.Second {
		return errors.New("auth.jwt_ttl must be at least one second")
	}
	if strings.TrimSpace(cfg.Redis.Address) == "" {
		return errors.New("redis.address is required")
	}
	if cfg.Redis.Database < 0 {
		return errors.New("redis.database must not be negative")
	}
	if strings.TrimSpace(cfg.Redis.Stream) == "" {
		return errors.New("redis.stream is required")
	}
	if cfg.Redis.PublishTimeout <= 0 {
		return errors.New("redis.publish_timeout must be positive")
	}
	return nil
}

func applyWSDefaults(cfg *Config) {
	if strings.TrimSpace(cfg.AttachmentDir) == "" {
		cfg.AttachmentDir = "data/attachments"
	}
	if strings.TrimSpace(cfg.WSAddress) == "" {
		cfg.WSAddress = ":8081"
	}
	if strings.TrimSpace(cfg.WSPublicURL) == "" {
		cfg.WSPublicURL = "ws://localhost:8081/ws"
	}
	if len(cfg.WSOrigins) == 0 {
		cfg.WSOrigins = []string{"localhost:8080", "127.0.0.1:8080"}
	}
	if cfg.WSTicketTTL == 0 {
		cfg.WSTicketTTL = 30 * time.Second
	}
}
