import json

transcript_path = r"C:\Users\User\.gemini\antigravity\brain\57df2e2b-52fa-42b8-8509-09309fd68d88\.system_generated\logs\transcript.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        obj = json.loads(line)
        content = obj.get("content", "")
        # Look for references to index.html and modalStatus or modalWhatsApp in edits or system prompt
        if "modalStatus" in content or "modalWhatsApp" in content:
            print(f"Step {obj.get('step_index')}: Type: {obj.get('type')}, Source: {obj.get('source')}")
            # print snippet of content
            snippet = content[:500].replace('\n', ' ')
            print(f"  Snippet: {snippet}...")
