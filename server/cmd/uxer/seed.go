package main

import (
	"log"
	"time"

	"uxer/internal/auth"
	"uxer/internal/db"
)

// seedDefaults populates a brand-new database with the demo content: an
// admin account (admin/admin), a "samples" project, and two example personas.
// It is a no-op when the database already contains users, so it only runs on
// first install. Set UXER_SEED_DEFAULTS=0 to disable (e.g. in tests).
func seedDefaults(database *db.DB) error {
	var count int
	if err := database.SQL.QueryRow(`SELECT COUNT(1) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword("admin")
	if err != nil {
		return err
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	adminID := db.NewID()
	projectID := db.NewID()

	tx, err := database.SQL.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	exec := func(query string, args ...any) error {
		if _, err := tx.Exec(query, args...); err != nil {
			return err
		}
		return nil
	}

	if err := exec(
		`INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
		adminID, "admin", "Admin", hash, ts,
	); err != nil {
		return err
	}
	if err := exec(
		`INSERT INTO projects (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		projectID, "samples", adminID, ts, ts,
	); err != nil {
		return err
	}
	personas := []struct{ label, url string }{
		{"figmas", "https://www.figma.com/resource-library/what-is-prototyping/"},
		{"RHCE", "https://osac-project.github.io/osac-ux/"},
	}
	for i, p := range personas {
		if err := exec(
			`INSERT INTO versions (id, project_id, label, url, seq, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			db.NewID(), projectID, p.label, p.url, i+1, ts,
		); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("seeded default data: admin user, samples project, and %d personas", len(personas))
	return nil
}
