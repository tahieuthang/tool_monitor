client<llm> MyGemini {
  provider "google-ai"
  options {
    model "gemini-3"
    api_key env.GEMINIAI_API_KEY
  }
}