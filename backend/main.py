from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import subprocess
import json
import os
import time
from ocr import extract_text

app = FastAPI(title="AEGIS-AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to AEGIS-AI Backend API"}

@app.post("/api/ocr")
async def process_ocr(file: UploadFile = File(...)):
    contents = await file.read()
    text = extract_text(contents)
    return {"extracted_text": text}

def run_fl_simulation():
    # Clear old status
    with open("fl_status.json", "w") as f:
        json.dump({"status": "starting", "rounds": []}, f)
        
    print("Starting FL Server...")
    # Run the server
    server_process = subprocess.Popen(["venv/bin/python", "fl_server.py"])
    
    time.sleep(3) # Wait for server to start
    
    print("Starting FL Clients...")
    # Run 3 clients
    client_processes = []
    for i in range(3):
        p = subprocess.Popen(["venv/bin/python", "fl_client_node.py", f"Hospital_{i+1}"])
        client_processes.append(p)
        
    # Wait for server to finish
    server_process.wait()
    
    # Terminate clients just in case
    for p in client_processes:
        p.terminate()
        
    # Mark as completed if it didn't crash
    if os.path.exists("fl_status.json"):
        with open("fl_status.json", "r+") as f:
            try:
                status = json.load(f)
                if status["status"] != "completed":
                    status["status"] = "error"
                    f.seek(0)
                    f.truncate()
                    json.dump(status, f)
            except:
                pass

@app.post("/api/fl/start")
def start_fl(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_fl_simulation)
    return {"status": "Federated Learning initiated"}

@app.get("/api/fl/status")
def get_fl_status():
    if os.path.exists("fl_status.json"):
        try:
            with open("fl_status.json", "r") as f:
                return json.load(f)
        except:
            return {"status": "error", "rounds": []}
    return {"status": "idle", "rounds": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
