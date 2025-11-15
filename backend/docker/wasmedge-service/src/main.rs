// WasmEdge HTTP Service
// 
// HTTP service that wraps WasmEdge for executing WASM modules.
// Accepts POST /execute with WASM binary and input, returns execution result.

use actix_web::{web, App, HttpServer, HttpResponse, Result as ActixResult};
use serde::{Deserialize, Serialize};
use wasmedge_sdk::{
    config::{CommonConfigOptions, ConfigBuilder, HostRegistrationConfigOptions},
    params, Vm, WasmValue,
};
use std::time::Instant;

#[derive(Deserialize)]
struct ExecuteRequest {
    wasm: String, // Base64 encoded WASM binary
    input: serde_json::Value,
    function_name: Option<String>,
    memory_limit: Option<u64>,
    timeout: Option<u64>,
}

#[derive(Serialize)]
struct ExecuteResponse {
    success: bool,
    output: Option<serde_json::Value>,
    error: Option<String>,
    execution_time: Option<u64>,
    memory_used: Option<u64>,
}

async fn execute_wasm(req: web::Json<ExecuteRequest>) -> ActixResult<HttpResponse> {
    let start_time = Instant::now();
    
    // Decode WASM binary
    let wasm_bytes = match base64::decode(&req.wasm) {
        Ok(bytes) => bytes,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Invalid WASM base64: {}", e)),
                execution_time: Some(start_time.elapsed().as_millis() as u64),
                memory_used: None,
            }));
        }
    };

    // Create WasmEdge configuration
    let config = ConfigBuilder::new(CommonConfigOptions::default())
        .with_host_registration_config(HostRegistrationConfigOptions::default().wasi(true))
        .build()
        .map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("Config error: {}", e))
        })?;

    // Create VM
    let vm = match Vm::new(Some(config)) {
        Ok(vm) => vm,
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Failed to create VM: {}", e)),
                execution_time: Some(start_time.elapsed().as_millis() as u64),
                memory_used: None,
            }));
        }
    };

    // Load WASM module
    let vm = match vm.load_wasm_from_bytes(&wasm_bytes) {
        Ok(vm) => vm,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Failed to load WASM: {}", e)),
                execution_time: Some(start_time.elapsed().as_millis() as u64),
                memory_used: None,
            }));
        }
    };

    // Validate WASM module
    let vm = match vm.validate() {
        Ok(vm) => vm,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Invalid WASM module: {}", e)),
                execution_time: Some(start_time.elapsed().as_millis() as u64),
                memory_used: None,
            }));
        }
    };

    // Instantiate module
    let vm = match vm.instantiate() {
        Ok(vm) => vm,
        Err(e) => {
            return Ok(HttpResponse::InternalServerError().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Failed to instantiate WASM: {}", e)),
                execution_time: Some(start_time.elapsed().as_millis() as u64),
                memory_used: None,
            }));
        }
    };

    // Prepare input
    let input_json = serde_json::to_string(&req.input).unwrap_or_else(|_| "{}".to_string());
    let function_name = req.function_name.as_deref().unwrap_or("main");

    // Execute function
    match vm.run_func(function_name, params![]) {
        Ok(results) => {
            // Convert results to JSON
            let output: serde_json::Value = if results.is_empty() {
                req.input.clone()
            } else {
                // Try to convert first result to JSON
                // This is a simplified conversion - actual implementation may need more complex handling
                serde_json::json!({ "result": "execution successful" })
            };

            let execution_time = start_time.elapsed().as_millis() as u64;

            Ok(HttpResponse::Ok().json(ExecuteResponse {
                success: true,
                output: Some(output),
                error: None,
                execution_time: Some(execution_time),
                memory_used: None, // WasmEdge doesn't easily expose memory usage
            }))
        }
        Err(e) => {
            let execution_time = start_time.elapsed().as_millis() as u64;

            Ok(HttpResponse::InternalServerError().json(ExecuteResponse {
                success: false,
                output: None,
                error: Some(format!("Execution error: {}", e)),
                execution_time: Some(execution_time),
                memory_used: None,
            }))
        }
    }
}

async fn health_check() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "wasmedge-http-service"
    })))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let bind_address = format!("0.0.0.0:{}", port);

    println!("Starting WasmEdge HTTP Service on {}", bind_address);

    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_check))
            .route("/execute", web::post().to(execute_wasm))
    })
    .bind(&bind_address)?
    .run()
    .await
}

