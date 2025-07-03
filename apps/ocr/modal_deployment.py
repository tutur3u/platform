import modal

# Define base image and system dependencies
image = (
    modal.Image.debian_slim()
    # Install system dependencies
    .apt_install(["libgl1-mesa-glx", "libglib2.0-0"])
    # Install Python packages
    .pip_install(
        [
            "fastapi[standard]",
            "numpy",
            "opencv-python",
            "paddleocr==3.1.0",
            "paddlepaddle==3.0.0",
            "setuptools",
        ]
    )
    # Add local source code
    .add_local_python_source("main")
)
app = modal.App("ocr-service", image=image)

@app.function(cpu=2, memory=2048, min_containers=1)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    from main import app
    
    return app
