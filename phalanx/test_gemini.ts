import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelName: string) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("hi");
    console.log(`[${modelName}] SUCCESS: ${result.response.text()}`);
    return true;
  } catch (err: any) {
    console.error(`[${modelName}] FAILED: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log("Testing gemini-2.5-flash...");
  const success = await testModel('gemini-2.5-flash');
  
  if (!success) {
    console.log("\\nTesting fallback to gemini-1.5-flash...");
    await testModel('gemini-1.5-flash');
  }
}

run();
