export async function onRequestPost(context) {
  try {
    // 1. Parse the incoming data sent from your frontend text boxes
    const data = await context.request.json();
    const { jobDescription, yourBackground, tone } = data;

    // 2. TODO: Add your AI generation logic here (e.g., calling Gemini/OpenAI API)
    // For now, we return a mock success response to fix your 405 error
    const mockResponse = {
      success: true,
      message: "Backend connected successfully!",
      tailoredKit: `Here is your tailored kit for the tone: ${tone || 'Professional'}`
    };

    // 3. Send the JSON back to your frontend
    return new Response(JSON.stringify(mockResponse), {
      headers: { 
        "Content-Type": "application/json" 
      },
    });

  } catch (error) {
    // If something breaks, return a 500 error cleanly in JSON format
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}