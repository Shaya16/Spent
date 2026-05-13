-- Only update if the user is still on the original default
UPDATE settings
SET value = 'llama3.2:3b', updated_at = datetime('now')
WHERE key = 'ai_ollama_model' AND value = 'llama3.1';
