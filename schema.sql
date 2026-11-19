CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, hash TEXT, invite TEXT UNIQUE, expires INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, theme TEXT NOT NULL, zone TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(campaign TEXT REFERENCES campaigns(id), user TEXT REFERENCES users(id), role TEXT CHECK(role IN ('gm','player')), active INTEGER NOT NULL DEFAULT 1, character TEXT NOT NULL DEFAULT '', PRIMARY KEY(campaign,user));
CREATE TABLE IF NOT EXISTS personas(id TEXT PRIMARY KEY,campaign TEXT REFERENCES campaigns(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY,campaign TEXT REFERENCES campaigns(id),author TEXT REFERENCES users(id),kind TEXT CHECK(kind IN ('message','mission')), mode TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, release INTEGER NOT NULL, published INTEGER, thread TEXT, batch TEXT, persona TEXT, detail TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS resources_campaign ON resources(campaign,kind,published,id);
CREATE INDEX IF NOT EXISTS resources_due ON resources(status,release);
CREATE TABLE IF NOT EXISTS deliveries(resource TEXT REFERENCES resources(id), user TEXT REFERENCES users(id), read INTEGER, PRIMARY KEY(resource,user));
CREATE INDEX IF NOT EXISTS deliveries_user ON deliveries(user,resource);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, resource TEXT NOT NULL REFERENCES resources(id), name TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,campaign TEXT REFERENCES campaigns(id),actor TEXT REFERENCES users(id), action TEXT NOT NULL, resource TEXT, timestamp INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS dispatch_keys(campaign TEXT REFERENCES campaigns(id), actor TEXT REFERENCES users(id), key TEXT, response TEXT NOT NULL, PRIMARY KEY(campaign,actor,key));
CREATE TABLE IF NOT EXISTS account_handles(user TEXT PRIMARY KEY REFERENCES users(id), handle TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS room_codes(campaign TEXT PRIMARY KEY REFERENCES campaigns(id), code TEXT UNIQUE NOT NULL);

