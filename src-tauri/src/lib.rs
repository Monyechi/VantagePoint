use keyring::Entry;

const KEYCHAIN_SERVICE: &str = "com.clientpilot.app";

#[tauri::command]
fn get_api_key(provider: String) -> Result<Option<String>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &provider).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_api_key(provider: String, secret: String) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &provider).map_err(|e| e.to_string())?;
    if secret.trim().is_empty() {
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&secret).map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_api_key, set_api_key])
        .run(tauri::generate_context!())
        .expect("error while running VantagePoint");
}
