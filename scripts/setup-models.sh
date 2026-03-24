#!/bin/bash
set -euo pipefail

MODEL_DIR="public/mediapipe/models"
BASE_URL="https://storage.googleapis.com/mediapipe-models"

mkdir -p "$MODEL_DIR"

models=(
  "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  "pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
  "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
  "gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
)

for model in "${models[@]}"; do
  filename=$(basename "$model")
  if [ -f "$MODEL_DIR/$filename" ]; then
    echo "skip: $filename (exists)"
  else
    echo "download: $filename"
    curl -sL -o "$MODEL_DIR/$filename" "$BASE_URL/$model"
  fi
done

echo "done"
