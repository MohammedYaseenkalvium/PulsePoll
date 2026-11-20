package config

import (
	"bufio"
	"os"
	"strings"
)

// loadDotEnv reads simple KEY=VALUE lines from the first .env file found and
// sets them as environment variables. It never overrides variables that are
// already set, so real environment config (Docker, cloud hosts, shell exports)
// always wins. Missing files are silently ignored.
//
// Supported syntax: blank lines, # comments, optional `export ` prefix, and
// single- or double-quoted values. Inline comments are stripped only from
// unquoted values (`KEY=value # note`).
func loadDotEnv(paths ...string) string {
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			line = strings.TrimPrefix(line, "export ")
			key, val, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			val = strings.TrimSpace(val)

			if n := len(val); n >= 2 && (val[0] == '"' || val[0] == '\'') && val[n-1] == val[0] {
				val = val[1 : n-1]
			} else if i := strings.Index(val, " #"); i >= 0 {
				val = strings.TrimSpace(val[:i])
			}

			if key == "" {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
		f.Close()
		return p
	}
	return ""
}
