import OpenAI from 'openai';

//Groq is openAI compatible so we just point the  base URL at Groq

function getGroqClient(): OpenAI {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('Missing GROQ_API_KEY environment variable');
    }

    return new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1'
    });
}

// This takes the raw order book snapshot and formats it into somethign readablr that we can send AI as context
function formatBookForPrompt(book: any):string {
const bids = Object.entries(book.bids)
.map(([price, orders]: any) => `${price}: ${orders.length} order(s)`)
.join('\n');

const asks = Object.entries(book.asks)
.map(([price, orders]: any) => ` ${price}: ${orders.length} order(s)`)
.join('\n');
return `

Symbol: ${book.symbol}
Best Bid: ${book.bestBid ?? 'none'}
Best Ask: ${book.bestAsk ?? 'none'}

Bids (buyers):
${bids || ' none'}

Asks (sellers):
${asks || ' none'}
`.trim();
}

// Take the order book snapshot, calls Groq, and streams the response 
//  we use a callback here so the webSocket handler can send each chunk to the client as it arrives
export async function streamBookSummary(
    book: any,
    onChunk: (text: string) => void,
    onDone: () => void
): Promise<void> {
    const formattedBook = formatBookForPrompt(book);
    const groq = getGroqClient();
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    const stream = await groq.chat.completions.create({
        model,
        stream: true,
        messages: [ 
            {
                role: 'system',
                content: 'You are a financial analyst summarizing an order book for a trading platform. Be concise, direct, and use plain english. 2-3 sentences max.'

            },
            {
                role: 'user',
                content: `Summarize this order book and describe the current market sentiment:\n\n${formattedBook}`
            }
        ]
    });

    // As each chunk arrive from Groq, we pass it to the callback 
    // The callback sends it over WebSocket to the client

    for await (const chunk of stream ) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) {
            onChunk(text);
        }
    }

    onDone();
}