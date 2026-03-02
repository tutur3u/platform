import modal

# Define base image and system dependencies
image = (
    modal.Image.debian_slim(python_version="3.12")
    # Install system dependencies
    .apt_install(["libgl1-mesa-glx", "libglib2.0-0"])
    # Install Python packages
    .pip_install_from_pyproject("pyproject.toml")
    # Add local source code
    .add_local_python_source("app", "extraction", "frame_processor")
)
app = modal.App("ocr-service", image=image)


@app.function(cpu=2, memory=2048, min_containers=1)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    from apps.ocr.app import app

    return app
