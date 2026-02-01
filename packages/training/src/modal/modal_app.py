"""
Modal app definition for cad0 training.

Usage:
    # Setup secrets
    modal secret create huggingface-secret HUGGING_FACE_HUB_TOKEN=<token>
    modal secret create wandb-secret WANDB_API_KEY=<key>

    # Create volume and upload data
    modal volume create vcad-training-vol
    modal volume put vcad-training-vol packages/training/data/train.jsonl /data/train.jsonl
    modal volume put vcad-training-vol packages/training/data/val.jsonl /data/val.jsonl

    # Run training
    modal run modal_app.py::train

    # Download model
    modal volume get vcad-training-vol /data/checkpoints/merged ./cad0-model
"""

import modal

# Modal app
app = modal.App("cad0-training")

# Persistent volume for data and checkpoints
volume = modal.Volume.from_name("vcad-training-vol", create_if_missing=True)

# Container image with all dependencies
# Use CUDA image for flash-attn compilation
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("git")
    .pip_install(
        "packaging",
        "ninja",
        "wheel",
    )
    .pip_install(
        "torch==2.5.1",
        extra_options="--extra-index-url https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "transformers==4.47.0",
        "peft==0.14.0",
        "trl==0.13.0",
        "datasets==3.2.0",
        "bitsandbytes==0.45.0",
        "accelerate==1.2.1",
        "wandb==0.19.1",
        "hf_transfer",
    )
    .pip_install(
        "flash-attn",
        extra_options="--no-build-isolation",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .add_local_dir(".", "/root", copy=True)
)


@app.function(
    image=image,
    gpu="A100-80GB",
    volumes={"/data": volume},
        secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("wandb-secret"),
    ],
    timeout=60 * 60 * 8,  # 8 hours
)
def train(
    model_name: str = "Qwen/Qwen2.5-Coder-7B",
    lora_r: int = 64,
    lora_alpha: int = 128,
    num_epochs: int = 3,
    batch_size: int = 4,
    grad_accum: int = 8,
    learning_rate: float = 2e-4,
    max_seq_length: int = 1024,
    max_samples: int | None = None,
    run_name: str | None = None,
):
    """
    Train the cad0 model with LoRA fine-tuning.

    Args:
        model_name: HuggingFace model ID
        lora_r: LoRA rank
        lora_alpha: LoRA alpha
        num_epochs: Number of training epochs
        batch_size: Per-device batch size
        grad_accum: Gradient accumulation steps
        learning_rate: Learning rate
        max_seq_length: Maximum sequence length
        max_samples: Limit samples for debugging (None = use all)
        run_name: W&B run name
    """
    from config import Config, ModelConfig, TrainingConfig, DataConfig
    from train import train_model

    # Build config
    config = Config(
        model=ModelConfig(
            model_name=model_name,
            lora_r=lora_r,
            lora_alpha=lora_alpha,
        ),
        training=TrainingConfig(
            output_dir="/data/checkpoints",
            run_name=run_name or f"cad0-{model_name.split('/')[-1]}-lora",
            num_train_epochs=num_epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=grad_accum,
            learning_rate=learning_rate,
            max_seq_length=max_seq_length,
        ),
        data=DataConfig(
            train_path="/data/train.jsonl",
            val_path="/data/val.jsonl",
            max_samples=max_samples,
        ),
    )

    # Run training
    output_path = train_model(config)

    # Commit volume changes
    volume.commit()

    return output_path


@app.function(
    image=image,
    gpu="A100-80GB",
    volumes={"/data": volume},
        secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=60 * 60,  # 1 hour
)
def evaluate(
    model_path: str = "/data/checkpoints/merged",
    test_path: str = "/data/test.jsonl",
    max_samples: int | None = 500,
):
    """
    Evaluate a trained model on the test set.

    Args:
        model_path: Path to the merged model
        test_path: Path to test JSONL file
        max_samples: Maximum samples to evaluate
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from datasets import Dataset

    from data import load_jsonl
    from eval import evaluate_model, print_eval_report

    # Load model
    print(f"Loading model from {model_path}...")
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        model_path,
        trust_remote_code=True,
    )

    # Load test data
    print(f"Loading test data from {test_path}...")
    test_data = load_jsonl(test_path)
    test_dataset = Dataset.from_list(test_data)

    # Evaluate
    print("Running evaluation...")
    metrics = evaluate_model(
        model,
        tokenizer,
        test_dataset,
        validate_geometry=False,
        max_samples=max_samples,
    )

    print_eval_report(metrics)

    return {
        "syntax_accuracy": metrics.syntax_accuracy,
        "exact_match_accuracy": metrics.exact_match_accuracy,
        "total": metrics.total,
    }


@app.function(
    image=image,
    gpu="A100-80GB",
    volumes={"/data": volume},
        secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=60 * 10,  # 10 minutes
)
def generate(
    prompts: list[str],
    model_path: str = "/data/checkpoints/merged",
    temperature: float = 0.1,
    max_new_tokens: int = 256,
):
    """
    Generate Compact IR from text prompts.

    Args:
        prompts: List of design descriptions
        model_path: Path to the model
        temperature: Sampling temperature
        max_new_tokens: Maximum tokens to generate
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    from train import generate_sample

    # Load model
    print(f"Loading model from {model_path}...")
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        model_path,
        trust_remote_code=True,
    )

    # Generate
    results = []
    for prompt in prompts:
        print(f"\nPrompt: {prompt}")
        ir = generate_sample(
            model,
            tokenizer,
            prompt,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
        )
        print(f"IR:\n{ir}")
        results.append({"prompt": prompt, "ir": ir})

    return results


@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=60 * 5,
)
def upload_data(
    train_data: bytes,
    val_data: bytes,
    test_data: bytes | None = None,
):
    """
    Upload training data to the Modal volume.

    Args:
        train_data: Training JSONL file contents
        val_data: Validation JSONL file contents
        test_data: Optional test JSONL file contents
    """
    import os

    # Ensure directory exists
    os.makedirs("/data", exist_ok=True)

    # Write files
    with open("/data/train.jsonl", "wb") as f:
        f.write(train_data)
    print(f"Wrote {len(train_data)} bytes to /data/train.jsonl")

    with open("/data/val.jsonl", "wb") as f:
        f.write(val_data)
    print(f"Wrote {len(val_data)} bytes to /data/val.jsonl")

    if test_data:
        with open("/data/test.jsonl", "wb") as f:
            f.write(test_data)
        print(f"Wrote {len(test_data)} bytes to /data/test.jsonl")

    # Commit volume
    volume.commit()

    return "Data uploaded successfully"


@app.local_entrypoint()
def main(
    action: str = "train",
    max_samples: int | None = None,
    run_name: str | None = None,
):
    """
    Local entrypoint for cad0 training.

    Args:
        action: Action to perform (train, evaluate, generate)
        max_samples: Limit samples for debugging
        run_name: W&B run name
    """
    if action == "train":
        result = train.remote(
            max_samples=max_samples,
            run_name=run_name,
        )
        print(f"Training complete. Model saved to: {result}")

    elif action == "evaluate":
        result = evaluate.remote(max_samples=max_samples)
        print(f"Evaluation results: {result}")

    elif action == "generate":
        prompts = [
            "50x30mm mounting plate with 4 corner holes",
            "10mm diameter 25mm tall standoff",
            "L-bracket with mounting holes",
        ]
        results = generate.remote(prompts)
        for r in results:
            print(f"\n{r['prompt']}:\n{r['ir']}")

    else:
        print(f"Unknown action: {action}")
        print("Available actions: train, evaluate, generate")
