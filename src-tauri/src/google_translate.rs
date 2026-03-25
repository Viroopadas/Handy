use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::Value;

pub async fn translate(text: &str, target_lang: &str) -> Result<String> {
    let url = "https://translate.googleapis.com/translate_a/single";
    let params = [
        ("client", "gtx"),
        ("sl", "auto"),
        ("tl", target_lang),
        ("dt", "t"),
        ("q", text),
    ];

    let client = Client::new();
    let res = client.post(url).form(&params).send().await?;

    if !res.status().is_success() {
        return Err(anyhow!(
            "Google Translate API returned status {}",
            res.status()
        ));
    }

    let json: Value = res.json().await?;

    // The response is a nested array. The first element is an array of segments.
    // Each segment is an array where the first element is the translated text.
    let mut translated = String::new();

    if let Some(segments) = json
        .as_array()
        .and_then(|arr| arr.get(0))
        .and_then(|v| v.as_array())
    {
        for segment in segments {
            if let Some(text_segment) = segment
                .as_array()
                .and_then(|arr| arr.get(0))
                .and_then(|v| v.as_str())
            {
                translated.push_str(text_segment);
            }
        }
    } else {
        return Err(anyhow!(
            "Unexpected JSON format from Google Translate API"
        ));
    }

    if translated.is_empty() {
        return Err(anyhow!(
            "Failed to extract translation from Google Translate API"
        ));
    }

    Ok(translated)
}
