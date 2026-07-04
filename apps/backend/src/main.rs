use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::ExitCode;
use std::time::Duration;

use tuturuuu_backend::BackendConfig;
use tuturuuu_backend::native::{healthcheck_addr, listen_addr, router};

#[tokio::main]
async fn main() -> ExitCode {
    let config = BackendConfig::from_env();

    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return match run_healthcheck(&config) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }

    let addr = listen_addr(&config);
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("backend failed to bind {addr}: {error}");
            return ExitCode::FAILURE;
        }
    };

    println!(
        "backend server listening on {addr} runtime=rust environment={}",
        config.environment
    );

    match axum::serve(listener, router(config))
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("backend server failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            eprintln!("failed to install ctrl-c handler: {error}");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                eprintln!("failed to install terminate handler: {error}");
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

fn run_healthcheck(config: &BackendConfig) -> Result<(), String> {
    let addr = healthcheck_addr(config);
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3))
        .map_err(|error| format!("backend healthcheck connect failed: {error}"))?;

    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|error| format!("backend healthcheck timeout setup failed: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|error| format!("backend healthcheck timeout setup failed: {error}"))?;
    stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| format!("backend healthcheck request failed: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("backend healthcheck response failed: {error}"))?;

    if response.starts_with("HTTP/1.1 2") || response.starts_with("HTTP/1.0 2") {
        return Ok(());
    }

    let status = response
        .lines()
        .next()
        .unwrap_or("missing HTTP status line");
    Err(format!("backend healthcheck returned {status}"))
}
