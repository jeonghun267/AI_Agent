import {loadConfig} from './config.mjs';
import {createApp} from './app.mjs';
import {DEMO_ACCOUNT} from './dev/seed.mjs';

const config = loadConfig();
const app = createApp(config);
const url = await app.listen();

console.log(`ReLo (${config.appEnv}) listening on ${url}`);
console.log(`Public origin: ${config.appOrigin}`);
console.log(`AI: ${config.ai.provider === 'gemini' ? `Gemini (${config.ai.model})` : config.ai.provider}`);
if (config.seedDemo) console.log(`Demo account: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);

const stop = () => app.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
