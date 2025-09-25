import { Agent, Model } from '@smythos/sdk';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * This is an example of an agent imported from a .smyth file
 * .smyth files are produced by the SmythOS Studio (Agent visual editor)
 *
 * All the skills are described in .smyth file, we don't need to implement them programmatically
 */

const __dirname = process.cwd();
const agentPath = path.resolve(__dirname, './data/crypto-assistant.smyth');

const agent = Agent.import(agentPath, {
    id: 'crypto-assistant', //<=== Chat persistence requires an explicitly identified agent
    model: 'gemini-2.5-flash',
});

export default agent;
