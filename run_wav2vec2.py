import os
import sys
import logging

logging.basicConfig(level=logging.INFO)

try:
    from datasets import load_dataset
    from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
    import torch
    import librosa
except ImportError as e:
    logging.error(f"Missing a required package. Make sure the background installation is finished! Error: {e}")
    sys.exit(1)

def test_engine():
    logging.info("Loading a sample from Buraaq/quran-md-words dataset...")
    try:
        ds = load_dataset("Buraaq/quran-md-words", split="train", streaming=True)
        sample = next(iter(ds))
    except Exception as e:
        logging.error(f"Error loading dataset: {e}")
        sys.exit(1)

    logging.info("Loading Wav2Vec2 phonetics model...")
    processor = Wav2Vec2Processor.from_pretrained("TBOGamer22/wav2vec2-quran-phonetics")
    model = Wav2Vec2ForCTC.from_pretrained("TBOGamer22/wav2vec2-quran-phonetics")
    model.eval()

    audio_array = sample['audio']['array']
    sr = sample['audio']['sampling_rate']

    if sr != 16000:
        audio_array = librosa.resample(y=audio_array, orig_sr=sr, target_sr=16000)

    logging.info("Running inference...")
    inputs = processor(audio_array, sampling_rate=16000, return_tensors="pt", padding=True)
    with torch.inference_mode():
        logits = model(inputs.input_values).logits
    predicted_ids = torch.argmax(logits, dim=-1)
    phonetics = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]

    print("\n--- TEST COMPLETE ---")
    print(f"Example ID: {sample.get('id', 'N/A')}")
    print(f"Dataset Text: {sample.get('text', sample.get('sentence', 'N/A'))}")
    print(f"Phonetics detected: {phonetics}")

if __name__ == "__main__":
    test_engine()
