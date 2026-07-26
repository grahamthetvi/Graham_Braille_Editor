package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
)

const peerListenAddr = "0.0.0.0:8081"
const peerPort = "8081"

// PairedPeer is a remote share host this Bridge can relay jobs to.
type PairedPeer struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Host  string `json:"host"` // host or host:port
	Token string `json:"token"`
}

// BridgeConfig is persisted under the OS user config directory.
type BridgeConfig struct {
	ShareEnabled  bool         `json:"shareEnabled"`
	ShareName     string       `json:"shareName"`
	ShareCodeHash string       `json:"shareCodeHash"`
	ShareCode     string       `json:"shareCode"` // plaintext so Settings can show it
	ShareToken    string       `json:"shareToken"`
	PairedPeers   []PairedPeer `json:"pairedPeers"`
}

var (
	cfgMu   sync.RWMutex
	cfg     BridgeConfig
	cfgPath string
)

func configDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "graham-bridge"), nil
}

func loadConfig() {
	dir, err := configDir()
	if err != nil {
		log.Printf("config: cannot resolve config dir: %v", err)
		return
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		log.Printf("config: mkdir: %v", err)
		return
	}
	cfgPath = filepath.Join(dir, "config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("config: read: %v", err)
		}
		return
	}
	var loaded BridgeConfig
	if err := json.Unmarshal(data, &loaded); err != nil {
		log.Printf("config: parse: %v", err)
		return
	}
	cfgMu.Lock()
	cfg = loaded
	if cfg.PairedPeers == nil {
		cfg.PairedPeers = []PairedPeer{}
	}
	cfgMu.Unlock()
}

func saveConfigLocked() error {
	if cfgPath == "" {
		dir, err := configDir()
		if err != nil {
			return err
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return err
		}
		cfgPath = filepath.Join(dir, "config.json")
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := cfgPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, cfgPath)
}

func getConfig() BridgeConfig {
	cfgMu.RLock()
	defer cfgMu.RUnlock()
	cp := cfg
	peers := make([]PairedPeer, len(cfg.PairedPeers))
	copy(peers, cfg.PairedPeers)
	cp.PairedPeers = peers
	return cp
}

func hashShareCode(code string) string {
	sum := sha256.Sum256([]byte("graham-bridge-share:" + code))
	return hex.EncodeToString(sum[:])
}

func codesEqual(plain, hash string) bool {
	if plain == "" || hash == "" {
		return false
	}
	got := hashShareCode(plain)
	return subtle.ConstantTimeCompare([]byte(got), []byte(hash)) == 1
}

func randomHex(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func generateShareCode() (string, error) {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000), nil
}

func ensureShareSecretsLocked() error {
	if cfg.ShareCode == "" || cfg.ShareCodeHash == "" {
		code, err := generateShareCode()
		if err != nil {
			return err
		}
		cfg.ShareCode = code
		cfg.ShareCodeHash = hashShareCode(code)
	}
	if cfg.ShareToken == "" {
		tok, err := randomHex(24)
		if err != nil {
			return err
		}
		cfg.ShareToken = tok
	}
	if cfg.ShareName == "" {
		cfg.ShareName = "Shared Embosser"
	}
	return nil
}
