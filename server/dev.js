import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeExecutable = process.execPath
const viteExecutable = path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
const children = [
  spawn(nodeExecutable, ['--env-file-if-exists=.env', 'server/index.js'], { cwd: projectDirectory, stdio: 'inherit', shell: false }),
  spawn(nodeExecutable, [viteExecutable], { cwd: projectDirectory, stdio: 'inherit', shell: false }),
]

let stopping = false
function stopChildren(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  process.exitCode = exitCode
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a development process:', error.message)
    stopChildren(1)
  })
  child.on('exit', (code) => {
    if (!stopping) stopChildren(code ?? 1)
  })
}

process.on('SIGINT', () => stopChildren(0))
process.on('SIGTERM', () => stopChildren(0))
