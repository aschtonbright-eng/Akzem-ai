import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
rmSync(path.join(root, 'public', 'assets'), { recursive: true, force: true })
rmSync(path.join(root, 'public', 'index.html'), { force: true })
