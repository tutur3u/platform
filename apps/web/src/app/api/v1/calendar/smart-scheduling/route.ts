import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY } = body;

    // Checking prompt
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is not provided and not available in the environment' },
        { status: 400 }
      );
    }

    // Try to enhance prompt with Gemini
    const enhancedPrompt = `${prompt}

ADDITIONAL SCHEDULING INSTRUCTIONS:
1. Prioritize events in order of priority level, with Critical (P1) > High (P2) > Medium (P3) > Low (P4)
2. Place longer events earlier in the day when possible
3. Leave buffers between events (15-30 minutes) when scheduling
4. Consider optimal hours based on category for better focus and productivity
5. Ensure events are only scheduled within their available time slots
6. Avoid creating fragmented time blocks - aim for continuous work sessions
7. Make sure events don't overlap with fixed events
8. Always honor original day constraints - never move events to different days
9. For tasks with deadlines, prioritize those with closer due dates
10. Balance work and personal events to support work-life balance

Please analyze the calendar thoroughly and provide smart scheduling decisions that maximize productivity while respecting time constraints and priorities.

Please format your response exactly as requested, containing only the JSON array with no explanation text.`;

    console.log('🔍 Using Gemini 2.0 Flash API...');
    
    // Log the API key's first 4 characters for debugging (KHÔNG hiển thị full API key)
    if (apiKey && apiKey.length > 8) {
      console.log(`🔑 API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
    } else {
      console.log('❌ Warning: API key seems invalid or too short');
    }

    // Gọi Gemini API với prompt nâng cao
    const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
    console.log('🌐 Calling Gemini API at:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: enhancedPrompt }]
        }],
        generationConfig: {
          temperature: 0.3, // Giảm temperature để có kết quả nhất quán hơn
          maxOutputTokens: 8192,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error status:', response.status);
      console.error('❌ Gemini API error text:', errorText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('✅ Received response from Gemini API');
    
    // Kiểm tra phản hồi và trích xuất văn bản
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const rawText = data.candidates[0].content.parts[0].text;
      
      try {
        // Enhace to processing json
        // Remove non-JSON characters and find the main JSON part
        let jsonText = rawText.trim();
        
        // Xóa các markdown code block nếu có
        jsonText = jsonText.replace(/^```json\n|\n```$/gm, '');
        
        // If there is no [] around, find JSON array
        if (!jsonText.startsWith('[') && !jsonText.endsWith(']')) {
          const arrMatch = jsonText.match(/\[\s*\{.*\}\s*\]/s);
          if (arrMatch) {
            jsonText = arrMatch[0];
          }
        }
        
        const parsedData = JSON.parse(jsonText);
        
        if (!Array.isArray(parsedData)) {
          throw new Error('Expected JSON array response');
        }
        
        // Validate and complete data
        const validatedData = parsedData.map(item => {
          // Make sure each item has all the necessary fields
          if (!item.id || !item.newStart || !item.newEnd) {
            throw new Error('Missing required fields in response items');
          }
          
          // Make sure changed is a boolean
          if (typeof item.changed !== 'boolean') {
            item.changed = item.newStart !== item.originalStart;
          }
          
          return item;
        });
        
        return NextResponse.json({
          success: true,
          data: validatedData,
          rawText: rawText
        });
      } catch (parseError) {
        console.error('Error parsing Gemini response:', parseError, 'Raw text:', rawText);
        return NextResponse.json({
          success: true,
          data: null,
          rawText: rawText,
          parseError: 'Failed to parse JSON response'
        });
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid response from Gemini API'
    }, { status: 500 });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Server error processing request' },
      { status: 500 }
    );
  }
} 
