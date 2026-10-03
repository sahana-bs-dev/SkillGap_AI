"""
Adversarial test for the Resume Rewrite Agent.

Runs deliberately thin resumes through the agent and checks the FINAL
output for fabrication. Does not touch MongoDB.

Run from the backend folder:
    python -m scripts.adversarial_rewrite          # all cases
    python -m scripts.adversarial_rewrite 2        # only case 2
"""

import sys
import time

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from app.agents.resume_rewrite_agent import (
    REWRITE_MODEL,
    ResumeRewriteAgent,
    _has_term,
)
from app.llm.gemini_client import GeminiClient
from app.llm.schemas import (
    MatchedSkill,
    MatchingOutput,
    ResumeRewriteInput,
    SkillGapItem,
)

# Words that show embellishment if the rewrite adds them
CLAIM_WORDS = [
    "led", "managed", "team", "improved", "increased", "reduced",
    "optimized", "scalable", "production", "deployed", "architected",
    "enterprise", "high-performance",
]

CASES = [
    {
        "name": "One-line project, no numbers",
        "resume": """Jane Doe
jane@example.com

EDUCATION
ABC College - B.Tech in Computer Science, 2027

PROJECTS
Weather App
- Built a weather app using Python.

SKILLS
Python""",
        "matched": [("Python", "Built a weather app using Python")],
        "missing": ["Docker", "AWS", "SQL", "React"],
        "must_keep": ["Python", "Weather App"],
    },
    {
        "name": "Vague bullet, no skills section",
        "resume": """Meera S
meera@example.com

PROJECTS
Student Portal
- Made a portal for students.""",
        "matched": [],
        "missing": ["Python", "SQL", "Git", "Docker"],
        "must_keep": ["Student Portal"],
    },
    {
        "name": "Internship with tempting missing skills",
        "resume": """Rahul K
rahul@example.com

EDUCATION
XYZ Institute - B.E. in Information Technology, 2026

EXPERIENCE
Intern at Local Web Studio
- Helped with the company website.
- Fixed small issues reported by the team.""",
        "matched": [],
        "missing": ["JavaScript", "Git", "REST APIs", "HTML"],
        "must_keep": ["Local Web Studio"],
    },
    {
        "name": "Missing-skill list contains a skill the resume HAS",
        "resume": """Arun P
arun@example.com

SKILLS
Databases: MySQL, MongoDB
Languages: Java

PROJECTS
Library System
- Created a library system using Java and MySQL.""",
        "matched": [
            ("Java", "Created a library system using Java and MySQL"),
            ("MySQL", "Created a library system using Java and MySQL"),
        ],
        "missing": ["MongoDB", "Spring Boot", "Docker"],
        "must_keep": ["MySQL", "MongoDB", "Java"],
    },
]


def build_input(case: dict) -> ResumeRewriteInput:
    matching = MatchingOutput(
        score=40,
        matched_skills=[MatchedSkill(skill=s, evidence=e) for s, e in case["matched"]],
        missing_skills=case["missing"],
    )
    gaps = [SkillGapItem(skill=s, priority="high") for s in case["missing"]]
    return ResumeRewriteInput(
        resume_text=case["resume"], matching_output=matching, gaps=gaps
    )


def run_case(number: int, case: dict, agent: ResumeRewriteAgent) -> bool:
    print("=" * 70)
    print(f"CASE {number}: {case['name']}")

    agent_input = build_input(case)
    result = agent.run(agent_input)

    if not result.success:
        print(f"ERROR: {result.error}")
        return False

    text = result.data.rewritten_text

    # Hard checks: any of these is a failure
    problems = ResumeRewriteAgent._find_violations(agent_input, text)
    for term in case["must_keep"]:
        if not _has_term(term, text):
            problems.append(f"dropped original item '{term}'")

    # Soft checks: embellishment, review by hand
    soft = [
        w for w in CLAIM_WORDS
        if _has_term(w, text) and not _has_term(w, case["resume"])
    ]

    print("RESULT:", "PASS" if not problems else "FAIL")
    for p in problems:
        print(f"  - {p}")
    if soft:
        print("  SOFT FLAGS (check by eye):", ", ".join(soft))
    print("\n--- rewritten resume ---")
    print(text)
    return not problems


def main():
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    agent = ResumeRewriteAgent(llm_client=GeminiClient(), model=REWRITE_MODEL)

    passed = 0
    total = 0
    for number, case in enumerate(CASES, start=1):
        if only and number != only:
            continue
        total += 1
        if run_case(number, case, agent):
            passed += 1
        time.sleep(5)  # be gentle with the free-tier limits

    print("=" * 70)
    print(f"{passed}/{total} cases passed")


if __name__ == "__main__":
    main()