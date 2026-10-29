import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const configuredPath = process.env.SQLITE_PATH ?? 'data/wastetrack.sqlite'
const databasePath = path.resolve(backendDirectory, configuredPath)
mkdirSync(path.dirname(databasePath), { recursive: true })

function openDatabase() {
  const database = new DatabaseSync(databasePath)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  return database
}

const database = openDatabase()
database.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'))

function prepareSql(sql) {
  return sql
    .replace(/DATE_ADD\(UTC_TIMESTAMP\(\), INTERVAL 12 HOUR\)/g, "datetime('now', '+12 hours')")
    .replace(/UTC_TIMESTAMP\(\)/g, "datetime('now')")
    .replace(/\s+FOR UPDATE\b/gi, '')
}

function execute(databaseConnection, sql, parameters = []) {
  const statement = databaseConnection.prepare(prepareSql(sql))
  if (statement.columns().length > 0) return [statement.all(...parameters), undefined]

  const result = statement.run(...parameters)
  return [{
    insertId: Number(result.lastInsertRowid),
    affectedRows: Number(result.changes),
  }, undefined]
}

function createTransactionConnection() {
  const connection = openDatabase()
  return {
    execute: async (sql, parameters) => execute(connection, sql, parameters),
    beginTransaction: async () => connection.exec('BEGIN IMMEDIATE'),
    commit: async () => connection.exec('COMMIT'),
    rollback: async () => connection.exec('ROLLBACK'),
    release: () => connection.close(),
  }
}

export const pool = {
  execute: async (sql, parameters) => execute(database, sql, parameters),
  getConnection: async () => createTransactionConnection(),
}
