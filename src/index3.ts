//IMPORTANT NOTE : Your API keys are configured in one of the following files :
//  .smyth/.sre/vault.json
//  ~/.smyth/.sre/vault.json

//Edit the vault.json file to update your API keys

import BookAssistantAgent from './agents/BookAssistant.agent';
import CryptoAssistantAgent from './agents/CryptoAssistant.agent';
import express from 'express';
import cors from 'cors';
import { TLLMEvent } from '@smythos/sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const chatSessions = new Map();

const getAgent = (agentName: string) => {
    switch (agentName.toLowerCase()) {
        case 'book':
        case 'book-assistant':
            return BookAssistantAgent;
        case 'crypto':
        case 'crypto-assistant':
            return CryptoAssistantAgent;
        default:
            throw new Error(`Unknown agent: ${agentName}`);
    }
};

const getOrCreateChatSession = (agentName: string, sessionId?: string) => {
    const agent = getAgent(agentName);
    const chatSessionId = sessionId || `session-${agentName}-${Date.now()}`;

    if (!chatSessions.has(chatSessionId)) {
        const chat = agent.chat({
            id: chatSessionId,
            persist: true,
        });
        chatSessions.set(chatSessionId, { chat, agentName });
    }

    return {
        sessionId: chatSessionId,
        chat: chatSessions.get(chatSessionId).chat,
        agentName: chatSessions.get(chatSessionId).agentName,
    };
};

app.get('/api/agents', (req, res) => {
    res.json({
        agents: [
            { id: 'book', name: 'Book Assistant', description: 'Helpful assistant for book-related queries' },
            { id: 'crypto', name: 'Crypto Assistant', description: 'Assistant for cryptocurrency information' },
        ],
    });
});

app.post('/api/chat/start', (req, res) => {
    try {
        const { agentName, sessionId } = req.body;

        if (!agentName) {
            return res.status(400).json({ error: 'Agent name is required' });
        }

        const { sessionId: newSessionId, agentName: resolvedAgentName } = getOrCreateChatSession(agentName, sessionId);

        res.json({
            sessionId: newSessionId,
            agentName: resolvedAgentName,
            message: `Chat session started with ${resolvedAgentName}`,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/chat/message', async (req, res) => {
    try {
        const { sessionId, message, agentName } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let chatSession;
        if (sessionId && chatSessions.has(sessionId)) {
            chatSession = chatSessions.get(sessionId);
        } else if (agentName) {
            const result = getOrCreateChatSession(agentName, sessionId);
            chatSession = { chat: result.chat, agentName: result.agentName };
        } else {
            return res.status(400).json({ error: 'Either sessionId or agentName is required' });
        }

        const response = await chatSession.chat.prompt(message);

        res.json({
            sessionId: sessionId || `session-${chatSession.agentName}-${Date.now()}`,
            agentName: chatSession.agentName,
            message: message,
            response: response,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process message', details: error.message });
    }
});

app.post('/api/chat/stream', async (req, res) => {
    try {
        const { sessionId, message, agentName } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let chatSession;
        if (sessionId && chatSessions.has(sessionId)) {
            chatSession = chatSessions.get(sessionId);
        } else if (agentName) {
            const result = getOrCreateChatSession(agentName, sessionId);
            chatSession = { chat: result.chat, agentName: result.agentName };
        } else {
            return res.status(400).json({ error: 'Either sessionId or agentName is required' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
        });

        res.write(
            `data: ${JSON.stringify({
                type: 'start',
                sessionId: sessionId || `session-${chatSession.agentName}-${Date.now()}`,
                agentName: chatSession.agentName,
            })}\n\n`
        );

        const stream = await chatSession.chat.prompt(message).stream();

        stream.on(TLLMEvent.Content, (content) => {
            res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
        });

        stream.on(TLLMEvent.ToolCall, (toolCall) => {
            res.write(
                `data: ${JSON.stringify({
                    type: 'tool_call',
                    tool: toolCall?.tool?.name,
                    arguments: toolCall?.tool?.arguments,
                })}\n\n`
            );
        });

        stream.on(TLLMEvent.End, () => {
            res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
            res.end();
        });

        stream.on(TLLMEvent.Error, (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        });
    } catch (error) {
        console.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

app.get('/api/chat/sessions', (req, res) => {
    const sessions = Array.from(chatSessions.entries()).map(([sessionId, { agentName }]) => ({
        sessionId,
        agentName,
        createdAt: new Date().toISOString(),
    }));

    res.json({ sessions });
});

app.delete('/api/chat/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    if (chatSessions.has(sessionId)) {
        chatSessions.delete(sessionId);
        res.json({ message: 'Session deleted successfully' });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Agent Server running on http://localhost:${PORT}`);
});

//Below you can find other ways to interact with the agent (for reference)

//1. call a skill directly
// const result = await BookAssistantAgent.call('get_book_info', {
//     book_name: 'The Black Swan',
// });
// console.log(result);

//2. prompt
//const result = await BookAssistantAgent.prompt('Who is the author of the book "The Black Swan"?');
//console.log(result);

//3. prompt and stream response
// const stream = await BookAssistantAgent.prompt('Who is the author of the book "The Black Swan"?').stream();
// stream.on(TLLMEvent.Content, (content) => {
//     console.log(content);
// });
