#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const harness = require('./harness');

const args = process.argv.slice(2);
const attachMode = args.includes('--attach');
const requestedSuite = args.find(arg => arg && !arg.startsWith('--')) || null;

if (attachMode) {
    console.log('[runner] Attach mode - connecting to existing app...');
} else {
    console.log('[runner] Starting app in test mode...');
}

async function loadTestCases() {
    const casesDir = path.join(__dirname, 'cases');
    const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.js')).sort();

    const suites = [];
    for (const file of files) {
        const mod = require(path.join(casesDir, file));
        suites.push({ name: file.replace('.js', ''), ...mod });
    }
    return suites;
}

async function main() {
    let suites = await loadTestCases();
    if (requestedSuite) {
        suites = suites.filter(suite => suite.name === requestedSuite);
        if (suites.length === 0) {
            throw new Error(`Unknown test suite: ${requestedSuite}`);
        }
    }
    console.log(`[runner] Loaded ${suites.length} test suites\n`);

    if (!attachMode) {
        await harness.startApp();
        await harness.waitForTestServer();
        await harness.waitForBackend();
    } else {
        await harness.waitForTestServer();
        await harness.waitForBackend();
    }

    const reporter = harness.runTests();

    for (const suite of suites) {
        console.log(`\n--- ${suite.name} ---`);
        if (typeof suite.run === 'function') {
            await suite.run(reporter.runOne);
        }
    }

    const { results, passed, failed, totalTime } = await reporter.done();

    const reportPath = path.join(__dirname, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        results, passed, failed, total: results.length, totalTime
    }, null, 2));
    console.log(`\n[runner] Report saved to ${reportPath}`);

    if (!attachMode) {
        await harness.stopApp();
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('[runner] Fatal error:', err);
    if (!attachMode) harness.stopApp();
    process.exit(2);
});
