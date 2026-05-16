-- Default OpenAI model for categorization (only if not already set).
INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('ai_openai_model', 'gpt-4o-mini', datetime('now'));
