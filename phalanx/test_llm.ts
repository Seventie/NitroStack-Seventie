import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * NVIDIA LLM connectivity check.
 * Run: npx tsx test_llm.ts
 */

const apiKey  = process.env.NVIDIA_API_KEY || '';
const model   = process.env.PHALANX_MODEL  || 'nvidia/nemotron-3-nano-30b-a3b';

async function run() {
  if (!apiKey) {
    console.error('❌ NVIDIA_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('🔑 API key :', apiKey.slice(0, 16) + '...');
  console.log('🤖 Model   :', model);
  console.log('🌐 Endpoint: https://integrate.api.nvidia.com/v1\n');

  const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
    timeout: 45_000
  });

  const start = Date.now();
  process.stdout.write('⏳ Sending request (streaming)... ');

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Say exactly: "LLM OK"' }],
      temperature: 1,
      top_p: 1,
      max_tokens: 20,
      stream: true
    });

    let text = '';
    for await (const chunk of stream) {
      const delta = (chunk.choices[0]?.delta as any)?.content;
      if (delta) text += delta;
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('done!\n');
    console.log(`✅ LLM IS WORKING (${elapsed}s)`);
    console.log(`   Response: "${text.trim()}"`);

  } catch (err: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('failed!\n');
    console.error(`❌ LLM FAILED (${elapsed}s): ${err.message}`);
    if (err.status) console.error(`   HTTP Status: ${err.status}`);
    process.exit(1);
  }
}

run();
