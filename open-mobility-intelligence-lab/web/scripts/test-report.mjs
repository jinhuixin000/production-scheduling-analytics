// Runs the front-end and pipeline test suites and writes public/data/tests.json,
// which the "Behind the Model" page displays. Usage: npm run test:report
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const tmp = '.vitest-report.json'
const v = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${tmp}`], { stdio: 'inherit' })
const rep = JSON.parse(readFileSync(tmp, 'utf8'))
rmSync(tmp)

let pipeline = null
try {
  const py = process.env.PYTHON ?? 'python3'
  const out = spawnSync(py, ['-m', 'pytest', '../pipeline/tests', '-q'], { encoding: 'utf8' }).stdout ?? ''
  const passed = +(out.match(/(\d+) passed/)?.[1] ?? 0)
  const failed = +(out.match(/(\d+) failed/)?.[1] ?? 0)
  if (passed + failed > 0) pipeline = { passed, total: passed + failed }
} catch { /* Python not available: the pipeline section stays empty */ }

let typecheck = true
try { execFileSync('npx', ['tsc'], { stdio: 'ignore' }) } catch { typecheck = false }

const report = {
  generatedUtc: new Date().toISOString(),
  web: { passed: rep.numPassedTests, total: rep.numTotalTests, files: rep.testResults.length },
  pipeline,
  build: { typecheck },
}
writeFileSync('public/data/tests.json', JSON.stringify(report))
console.log(report)
process.exit(v.status === 0 && typecheck && (!pipeline || pipeline.passed === pipeline.total) ? 0 : 1)
