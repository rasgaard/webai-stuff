import { AutoModel, AutoProcessor, AutoTokenizer, max } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js';

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class AutomaticSpeechRecognitionPipeline {
    static model_id = null;
    static tokenizer = null;
    static processor = null;
    static model = null;

    static async getInstance(progress_callback = null) {
        this.model_id = 'PierreMesure/roest-315m-onnx';

        this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
            progress_callback,
        });
        this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
            progress_callback,
        });

        this.model ??= AutoModel.from_pretrained(this.model_id, {
            quantized: false,
            device: 'wasm',
            progress_callback,
        });

        return Promise.all([this.tokenizer, this.processor, this.model]);
    }
}

async function load() {
    self.postMessage({ status: 'start_load', data: 'Loading model...' });
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();
    self.postMessage({ status: 'end_load', data: 'Model loaded successfully.' });
}


async function decode(output) {
    const logits = output.logits[0];
    const predicted_ids = [];
    for (const item of logits) {
        predicted_ids.push(max(item.data)[1]);
    }
    return predicted_ids;
}

let processing = false;
async function generate(audio) {
    if (processing) return;
    processing = true;


    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();
    self.postMessage({ status: "debug", data: "Processing audio..." })

    const inputs = await processor(audio);
    self.postMessage({ status: "debug", data: "Audio processed" })
    self.postMessage({ status: "debug", data: "Processing through model..." })
    const output = await model(inputs);
    self.postMessage({ status: "debug", data: "Model processing completed" })

    const predicted_ids = await decode(output);
    const transcription = await tokenizer.decode(predicted_ids);
    self.postMessage({ status: "debug", data: "Starting transcription" })
    const cleanTranscription = transcription.replace(/<unk>/g, '');
    self.postMessage({ status: 'result', data: cleanTranscription });
    self.postMessage({ status: "debug", data: "Transcription completed" })
    processing = false;
}


self.addEventListener('message', async (event) => {
    const { type, data } = event.data;
    switch (type) {
        case 'load':
            load();
            break;
        case 'generate':
            generate(data);
            break;
    }
});