import { cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(path.join(root, 'public'), { recursive: true })
cpSync(path.join(root, 'dist'), path.join(root, 'public'), { recursive: true, force: true })
