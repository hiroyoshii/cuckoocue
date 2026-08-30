import os
import sys


PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "cuckoocue")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "asia-northeast1")
DISPLAY_NAME = os.environ.get("CUE_MEMORY_BANK_DISPLAY_NAME", "CuckooCue Memory Bank")
PROFILE_SCHEMA_ID = os.environ.get("CUE_MEMORY_PROFILE_SCHEMA_ID", "cuckoo-user-profile")


def attribute_schema(description):
    return {
        "type": "array",
        "description": (
            description
            + " Store multiple short user-side attribute phrases. Prefer 1 to 6 words per phrase. "
            + "Extract phrases only when they are directly supported by user events. "
            + "Do not copy phrases from this schema description. "
            + "Do not write long explanations, full task titles, whole task-list summaries, or app feature descriptions."
        ),
        "items": {"type": "string"},
    }


PROFILE_SCHEMA_CONFIG = {
    "id": PROFILE_SCHEMA_ID,
    "memory_schema": {
        "title": "CuckooUserProfile",
        "type": "object",
        "properties": {
            "locale_attributes": attribute_schema(
                "Short locale, language, region, timezone, route, or local-rule phrases that can softly influence task-list ranking."
            ),
            "household_attributes": attribute_schema(
                "Short household, family, cohabitation, dependent, or pet phrases relevant to planning tasks."
            ),
            "work_attributes": attribute_schema(
                "Short work, availability, working-hours, or occupation-related phrases relevant to task scheduling."
            ),
            "device_attributes": attribute_schema(
                "Short device, OS, account ecosystem, or app/widget phrases relevant to task reuse."
            ),
            "mobility_attributes": attribute_schema(
                "Short transport, vehicle, accessibility, or movement-constraint phrases."
            ),
            "scheduling_attributes": attribute_schema(
                "Short timing, weekday/weekend, lead-time, or batching phrases."
            ),
            "channel_attributes": attribute_schema(
                "Short preferred contact or procedure channel phrases."
            ),
            "planning_attributes": attribute_schema(
                "Short planning style, sequencing, overview, dependency, or granularity phrases."
            ),
            "task_style_attributes": attribute_schema(
                "Short task wording, specificity, actionability, focus, or priority phrases."
            ),
        },
    },
}


def memory_bank_config():
    return {
        "display_name": DISPLAY_NAME,
        "context_spec": {
            "memory_bank_config": {
                "structured_memory_configs": [
                    {
                        "schema_configs": [PROFILE_SCHEMA_CONFIG],
                    }
                ],
            }
        },
    }


def create_client():
    try:
        import agentplatform

        return agentplatform.Client(project=PROJECT_ID, location=LOCATION)
    except ImportError:
        import vertexai

        return vertexai.Client(project=PROJECT_ID, location=LOCATION)


def main():
    client = create_client()
    if hasattr(client, "memory_banks"):
        memory_bank = next(
            (
                candidate
                for candidate in client.memory_banks.list()
                if getattr(candidate, "display_name", None) == DISPLAY_NAME
            ),
            None,
        )
        if memory_bank is None:
            memory_bank = client.memory_banks.create(
                config=memory_bank_config()
            )
        name = memory_bank.name
    else:
        memory_bank = client.agent_engines.create(
            config=memory_bank_config()
        )
        name = memory_bank.api_resource.name
    print(name)
    print(f"GOOGLE_CLOUD_AGENT_ENGINE_ID={name.split('/')[-1]}")
    print(f"CUE_MEMORY_PROFILE_SCHEMA_ID={PROFILE_SCHEMA_ID}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
