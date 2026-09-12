# SkillGap AI – Multi-Agent Career Optimization System

## 1. Project Overview

**SkillGap AI** is a multi-agent AI system designed to help students optimize their resumes for specific job descriptions, identify skill gaps, create personalized learning plans, and iteratively improve their job readiness.

The system uses a **Supervisor Agent** that coordinates multiple specialized agents and decides which agents, tools, and workflow stages need to be executed based on the user's input.

The system supports two primary scenarios:

### Scenario 1: Resume Only

When the user uploads only a resume:

```text
Resume
  ↓
Supervisor Agent
  ↓
ATS Agent
  ↓
ATS Score + Parsing Issues + Formatting Issues
  ↓
Improvement Suggestions
```

The ATS Agent evaluates the resume's compatibility with Applicant Tracking Systems and identifies problems that may prevent effective parsing or ranking.

---

### Scenario 2: Resume + Job Description

When the user uploads both a resume and a Job Description (JD):

```text
Resume + JD
      ↓
Supervisor Agent
      ↓
JD Analysis Agent
      ↓
Matching Agent
      ↓
Skill Gap Agent
      ↓
Learning Agent
      ↓
Project Recommendations
      ↓
Resume Rewrite Agent
      ↓
Re-match
      ↓
Improved Score
      ↓
Remaining Gaps
      ↓
Repeat
```

The system creates an **agentic improvement loop** that continuously improves the alignment between the student's resume and the target job.

---

# 2. Problem Statement

Students often apply for jobs without knowing:

* Whether their resume is ATS-friendly
* How well their resume matches a specific JD
* Which required skills they are missing
* Which skills should be prioritized
* What projects can demonstrate those skills
* What resources they should use to learn
* How to improve their resume without exaggerating their abilities
* Whether their resume actually improves after making changes

Existing resume builders and job portals generally provide isolated features.

SkillGap AI combines these capabilities into a single **agentic workflow**.

The system does not simply provide recommendations once.

Instead, it follows:

```text
Analyze → Identify → Learn → Build → Update → Re-evaluate
```

until the remaining skill gaps are minimized.

---

# 3. Objectives

The main objectives are:

1. Evaluate resume ATS compatibility.
2. Analyze job descriptions.
3. Extract required and preferred skills.
4. Compare resume skills against JD requirements.
5. Generate an explainable matching score.
6. Identify missing and partially matched skills.
7. Prioritize skill gaps.
8. Recommend practical projects for acquiring and demonstrating missing skills.
9. Generate personalized learning plans.
10. Provide valid learning resources.
11. Rewrite resumes for specific JDs.
12. Prevent hallucination and fabrication of candidate information.
13. Maintain multiple resume versions.
14. Maintain analysis history.
15. Compare previous and current resume performance.
16. Implement an iterative agentic improvement loop.

---

# 4. System Architecture

## High-Level Architecture

```text
                    ┌─────────────────────┐
                    │       User          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Resume / JD Input  │
                    └──────────┬──────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │    Supervisor Agent      │
                 │                          │
                 │ Workflow Orchestration   │
                 │ Agent Selection          │
                 │ Tool Selection           │
                 │ State Management          │
                 └────────────┬─────────────┘
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
   ┌─────────────┐     ┌─────────────┐      ┌─────────────┐
   │ ATS Agent   │     │ JD Analysis │      │  Matching   │
   │             │     │   Agent     │      │    Agent    │
   └─────────────┘     └─────────────┘      └──────┬──────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │ Skill Gap Agent│
                                          └───────┬────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │ Learning Agent │
                                          └───────┬────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │ Project        │
                                          │ Recommendations│
                                          └───────┬────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │ Resume Rewrite │
                                          │     Agent      │
                                          └───────┬────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │ Re-Matching    │
                                          └───────┬────────┘
                                                  │
                                                  ▼
                                         Improved Match Score
                                                  │
                                                  ▼
                                         Remaining Skill Gaps
                                                  │
                                                  └──────► LOOP
```

---

# 5. Agents

## 5.1 Supervisor Agent

The **Supervisor Agent** is the central orchestrator of the system.

It does not perform every task itself.

Instead, it determines:

* Which agents need to be invoked
* Which order they should execute in
* Which tools are required
* Whether additional analysis is necessary
* Whether the workflow should continue
* Whether the user needs to provide additional input

### Responsibilities

```text
Input Analysis
      ↓
Determine Available Inputs
      ↓
Resume Only?
      │
      ├── YES → ATS Agent
      │
      └── NO
           ↓
       Resume + JD
           ↓
      JD Analysis
           ↓
       Matching
           ↓
       Skill Gap
           ↓
       Learning
           ↓
       Resume Rewrite
           ↓
       Re-match
```

### Supervisor Decision Examples

| User Input             | Agents                                        |
| ---------------------- | --------------------------------------------- |
| Resume only            | ATS Agent                                     |
| Resume + JD            | JD Analysis → Matching → Skill Gap → Learning |
| Resume rewrite request | Resume Rewrite Agent                          |
| Updated resume         | Matching → Skill Gap                          |
| Re-evaluation          | ATS + Matching                                |
| Compare versions       | History/Version system                        |

The Supervisor should maintain workflow state so that completed analyses do not need to be unnecessarily repeated.

---

# 6. ATS Agent

## Purpose

Evaluate whether the resume is compatible with Applicant Tracking Systems.

## Inputs

```text
Resume
```

## Outputs

```text
ATS Score
Parsing Compatibility
Formatting Issues
Keyword Issues
Section Issues
Improvement Suggestions
```

## Evaluation Areas

### Formatting

* Consistent headings
* Standard fonts
* Appropriate spacing
* Simple structure
* Avoid excessive graphics
* Avoid unnecessary tables
* Avoid text embedded in images

### Structure

Check for sections such as:

* Contact Information
* Summary
* Education
* Experience
* Projects
* Skills
* Certifications

### Parsing

Identify potential problems such as:

* Complex layouts
* Multi-column structures
* Missing section headings
* Icons replacing text
* Images containing important information
* Unusual characters

### ATS Score

Example:

```text
ATS Score: 78/100

Parsing:        90
Formatting:     75
Section Quality:82
Keyword Usage:  68
Readability:    80
```

The score should be accompanied by an explanation rather than being treated as an absolute prediction of ATS behavior.

---

# 7. JD Analysis Agent

## Purpose

Understand the target Job Description.

## Inputs

```text
Job Description
```

## Outputs

The agent should extract:

### Required Skills

Skills explicitly required by the employer.

Example:

```text
Java
SQL
REST APIs
Spring Boot
Git
```

### Preferred Skills

Skills that are beneficial but not mandatory.

Example:

```text
Docker
AWS
Kubernetes
Redis
```

### Important Keywords

Terms that frequently occur or appear particularly relevant to the role.

### Experience Requirements

Example:

```text
0–2 years
Backend development
Database experience
API development
```

### Education Requirements

Example:

```text
Bachelor's degree
Computer Science
Information Technology
```

### Responsibilities

Extract major responsibilities to help determine whether the candidate's projects and experience are relevant.

---

# 8. Matching Agent

## Purpose

Compare the candidate's resume against the analyzed JD.

## Inputs

```text
Resume
+
JD Analysis
```

## Outputs

```text
Overall Match Score
Matched Skills
Partially Matched Skills
Missing Skills
Relevant Experience
Relevant Projects
Improvement Areas
```

---

## Explainable Matching

The matching score should not be a black-box number.

Example:

```text
Overall Match: 72%

Required Skills
-------------------------
Java             ✓ Strong Match
SQL              ✓ Strong Match
Spring Boot      △ Partial Match
REST APIs        ✓ Strong Match
Docker            ✗ Missing

Experience
-------------------------
Backend Projects     ✓
API Development      ✓
Cloud Deployment     ✗

Major Gap:
Docker + Containerization
```

The system should explain **why** the score was assigned.

---

# 9. Skill Gap Agent

## Purpose

Identify and prioritize skills the student needs to acquire.

The agent should not simply generate a list of missing skills.

It should rank them based on importance.

## Example

```text
Skill Gap Analysis

1. Spring Boot
   Priority: HIGH
   JD Importance: Required
   Resume Evidence: Weak

2. Docker
   Priority: HIGH
   JD Importance: Required

3. AWS
   Priority: MEDIUM
   JD Importance: Preferred

4. Kubernetes
   Priority: LOW
   JD Importance: Preferred
```

---

## Priority Factors

Skill priority can consider:

```text
JD Requirement Level
+
Skill Importance
+
Resume Evidence
+
Frequency in JD
+
Difficulty
+
Career Relevance
```

---

# 10. Project Recommendation System

The system should recommend projects that allow the student to:

1. Learn the missing skill.
2. Practice the skill.
3. Build something meaningful.
4. Demonstrate the skill on the resume.

The approach should be:

```text
Learn
  ↓
Practice
  ↓
Build
  ↓
Demonstrate
  ↓
Add Evidence to Resume
```

## Example

Missing Skill:

```text
Docker
```

Recommended project:

```text
Containerized Spring Boot REST API
```

Project progression:

```text
Learn Docker fundamentals
        ↓
Containerize a simple application
        ↓
Create Docker Compose setup
        ↓
Containerize Spring Boot + PostgreSQL
        ↓
Deploy the project
        ↓
Add measurable project evidence to resume
```

The project recommendation should be connected directly to the identified skill gap.

---

# 11. Learning Agent

## Purpose

Generate a personalized, time-bound learning plan.

The plan should follow:

```text
LEARN → PRACTICE → BUILD PROJECT
```

## Inputs

```text
Missing Skills
Skill Priorities
Student Context
Available Time
```

## Outputs

```text
Learning Roadmap
Duration
Daily/Weekly Tasks
Learning Resources
Practice Tasks
Project Milestones
Expected Outcome
```

---

## Example Learning Plan

### Skill: Docker

### Week 1 — Learn

```text
Day 1
Docker fundamentals

Day 2
Images and containers

Day 3
Dockerfiles

Day 4
Volumes and networks

Day 5
Docker Compose
```

### Week 2 — Practice

```text
Build simple Docker images
Run PostgreSQL in Docker
Create multi-container applications
Practice Docker CLI
```

### Week 3 — Build

```text
Build:
Containerized Spring Boot + PostgreSQL application
```

### Week 4 — Demonstrate

```text
Deploy project
Document architecture
Add project to resume
```

---

# 12. Learning Resource Requirements

The Learning Agent should provide useful and accessible resources from:

* Udemy
* Coursera
* YouTube

Resources should be validated before being presented.

The system should avoid generating fabricated course names or URLs.

Each recommendation should contain:

```text
Resource Name
Platform
Topic Covered
Estimated Duration
Difficulty
URL
Why It Is Recommended
```

Example:

```text
Resource:
Docker Fundamentals

Platform:
Coursera

Covers:
Containers
Images
Dockerfiles
Docker Compose

Recommended because:
Docker is a high-priority missing skill in the target JD.
```

---

# 13. Resume Rewrite Agent

## Purpose

Optimize the resume for the selected Job Description.

The agent should improve:

* Action verbs
* Bullet points
* Keyword alignment
* Skill visibility
* Project descriptions
* Experience descriptions
* Resume structure

---

## Critical Safety Rule

The Resume Rewrite Agent **must never fabricate information**.

It must NOT invent:

* Skills
* Experience
* Projects
* Certifications
* Achievements
* Job responsibilities
* Technologies
* Metrics

For example, if the original resume says:

```text
Created a Java project.
```

The agent can improve the wording if supported by the source material:

```text
Developed a Java-based application implementing...
```

But it must NOT invent:

```text
Improved application performance by 40%.
```

unless the candidate actually provided evidence for that metric.

---

# 14. Resume Version Management

The system should maintain different versions of the resume.

Example:

```text
Resume Versions

Version 1
Original Resume

Version 2
ATS Optimized

Version 3
Optimized for Software Engineer JD

Version 4
Updated after Docker Project
```

Each version should store:

```text
Version ID
Timestamp
Target JD
Changes
ATS Score
Match Score
Skill Gaps
```

---

# 15. Analysis History

The system should maintain historical analysis.

Example:

```text
Analysis History

Date: 01/09/2026
ATS Score: 65
Match Score: 52

Date: 05/09/2026
ATS Score: 74
Match Score: 68

Date: 12/09/2026
ATS Score: 86
Match Score: 81
```

This allows the student to track progress.

---

# 16. Progress Comparison

The system should compare previous and current versions.

Example:

```text
Resume Progress

ATS Score
65 → 86
+21

JD Match
52 → 81
+29

Matched Skills
8 → 14
+6

Missing Skills
9 → 4
-5
```

The system should explain **what caused the improvement**.

Example:

```text
Match score improved because:

✓ Spring Boot evidence was added
✓ REST API project was added
✓ Docker skill was demonstrated
✓ Resume keywords were better aligned
```

---

# 17. Agentic Improvement Loop

This is the core feature of SkillGap AI.

```text
                    ┌───────────────┐
                    │ Resume + JD   │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │    MATCH      │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │  SKILL GAPS   │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │    LEARN      │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │ BUILD PROJECT │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │ RESUME UPDATE │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │   RE-MATCH    │
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │ IMPROVED SCORE│
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │ REMAINING GAPS│
                    └───────┬───────┘
                            │
                            │
                            └──────────────► Repeat
```

---

# 18. Loop Termination

The Supervisor Agent should determine when another iteration is necessary.

Possible stopping conditions:

```text
Match Score reaches target threshold
        OR
No high-priority skill gaps remain
        OR
User chooses to stop
        OR
Further improvement requires acquiring new skills
```

The system should not blindly rewrite the resume repeatedly.

---

# 19. Agent Communication

Agents should exchange structured information rather than large unstructured text whenever possible.

Example:

```json
{
  "skill": "Docker",
  "importance": "HIGH",
  "jd_requirement": "required",
  "resume_evidence": false,
  "match_status": "missing"
}
```

The Supervisor can use these structured outputs to determine the next action.

---

# 20. Suggested Agent Workflow

```text
USER
 │
 │ Upload Resume
 │
 ▼
SUPERVISOR
 │
 ├── Resume Only?
 │       │
 │       └── YES
 │             ↓
 │        ATS AGENT
 │             ↓
 │        ATS REPORT
 │
 └── Resume + JD
         ↓
    JD ANALYSIS AGENT
         ↓
    MATCHING AGENT
         ↓
    SKILL GAP AGENT
         ↓
    LEARNING AGENT
         ↓
    PROJECT RECOMMENDATIONS
         ↓
    RESUME REWRITE AGENT
         ↓
    UPDATED RESUME
         ↓
    MATCHING AGENT
         ↓
    COMPARE RESULTS
         ↓
    REMAINING GAPS
         ↓
      SUPERVISOR
         │
         ├── Continue → Repeat
         │
         └── Sufficient → Final Report
```

---

# 21. Data Model

A simplified analysis object can contain:

```json
{
  "resume_id": "R001",
  "version": 3,
  "jd_id": "JD001",

  "ats": {
    "score": 84,
    "issues": []
  },

  "matching": {
    "score": 78,
    "matched_skills": [],
    "missing_skills": [],
    "partial_skills": []
  },

  "skill_gaps": [],

  "learning_plan": [],

  "projects": [],

  "changes": [],

  "timestamp": ""
}
```

---

# 22. Suggested Technology Architecture

## Frontend

Possible technologies:

```text
React
Next.js
```

Responsibilities:

* Resume upload
* JD input/upload
* Dashboard
* ATS score visualization
* Match score visualization
* Skill gap display
* Learning roadmap
* Project recommendations
* Resume version comparison
* Analysis history

---

## Backend

Possible technologies:

```text
Python
FastAPI
```

Responsibilities:

* Agent orchestration
* API endpoints
* Resume processing
* JD processing
* Agent execution
* Database operations
* Authentication
* Workflow management

---

## AI / LLM Layer

The project can use an LLM provider through an API.

Possible architecture:

```text
Application
     ↓
Supervisor
     ↓
LLM
     ↓
Specialized Agents
```

The model should be selected based on:

* Reasoning capability
* Structured output support
* Context window
* Cost
* Latency
* API availability

---

## Database

Possible choices:

```text
PostgreSQL
```

Store:

* Users
* Resumes
* Resume versions
* Job descriptions
* Analysis results
* Skill gaps
* Learning plans
* Projects
* History

---

# 23. Resume Processing

The system should support common resume formats such as:

```text
PDF
DOCX
TXT
```

Pipeline:

```text
Resume Upload
      ↓
File Validation
      ↓
Text Extraction
      ↓
Resume Parsing
      ↓
Structured Resume
      ↓
Agents
```

Structured resume example:

```json
{
  "name": "",
  "summary": "",
  "education": [],
  "experience": [],
  "projects": [],
  "skills": [],
  "certifications": []
}
```

---

# 24. Tool Usage

Agents may use external tools where appropriate.

Potential tools include:

### Web Search

Used for:

* Validating learning resources
* Finding current courses
* Finding YouTube tutorials
* Finding relevant project information

### Resume Parser

Used for:

* Extracting resume text
* Identifying sections
* Extracting skills and experience

### Database

Used for:

* Resume versions
* Analysis history
* User progress
* Skill gap history

---

# 25. Explainability

Every major AI-generated result should provide reasoning.

Instead of:

```text
Match Score: 73%
```

Provide:

```text
Match Score: 73%

Why?

✓ Strong Java experience
✓ SQL project experience
✓ REST API project
△ Limited Spring Boot evidence
✗ No Docker evidence
✗ No AWS evidence
```

This makes the system more trustworthy and useful for students.

---

# 26. Hallucination Prevention

The system should implement strict grounding.

For resume-related claims:

```text
Source of Truth = User Resume
```

For JD requirements:

```text
Source of Truth = User JD
```

For learning resources:

```text
Source of Truth = Validated External Resource
```

The system should never treat generated content as evidence of a candidate's real-world experience.

---

# 27. Example End-to-End Scenario

### Input

Student uploads:

```text
Resume.pdf
```

and:

```text
Software Engineer JD
```

### Step 1 — JD Analysis

System identifies:

```text
Required:
Java
Spring Boot
SQL
REST APIs

Preferred:
Docker
AWS
Kubernetes
```

### Step 2 — Matching

```text
Java          ✓
SQL           ✓
REST APIs     ✓
Spring Boot   △
Docker        ✗
AWS           ✗
Kubernetes    ✗
```

Match Score:

```text
68%
```

### Step 3 — Skill Gap

Priority:

```text
HIGH:
Spring Boot
Docker

MEDIUM:
AWS

LOW:
Kubernetes
```

### Step 4 — Learning Plan

```text
Spring Boot → 2 weeks
Docker      → 1 week
AWS basics  → 1 week
```

### Step 5 — Project

Recommended:

```text
Containerized Spring Boot REST API
with PostgreSQL
```

### Step 6 — Resume Update

The Resume Rewrite Agent updates the resume using **only genuine evidence** provided by the student.

### Step 7 — Re-match

New score:

```text
68% → 82%
```

### Step 8 — Remaining Gaps

```text
AWS
Kubernetes
```

The Supervisor determines whether another iteration is useful.

---

# 28. Core Innovation

The key innovation of SkillGap AI is not simply resume analysis.

It is the **closed-loop career improvement system**:

```text
UNDERSTAND THE JOB
        ↓
UNDERSTAND THE STUDENT
        ↓
IDENTIFY THE GAP
        ↓
LEARN THE SKILL
        ↓
BUILD EVIDENCE
        ↓
UPDATE THE RESUME
        ↓
MEASURE IMPROVEMENT
        ↓
IDENTIFY REMAINING GAPS
        ↓
REPEAT
```

This transforms the system from a traditional:

```text
Resume Analyzer
```

into an:

```text
AI Career Improvement Agent
```

---

# 29. Expected Final Dashboard

The dashboard can contain:

```text
┌─────────────────────────────────────────┐
│           SKILLGAP AI                   │
├─────────────────────────────────────────┤
│                                         │
│ ATS SCORE             JD MATCH          │
│    86/100               82%             │
│                                         │
├─────────────────────────────────────────┤
│ Matched Skills: 14                      │
│ Missing Skills: 4                       │
│ High Priority Gaps: 2                  │
├─────────────────────────────────────────┤
│                                         │
│ Skill Gap Progress                      │
│                                         │
│ Spring Boot      ██████████ 100%        │
│ Docker           ████████░░  80%        │
│ AWS              ████░░░░░░  40%        │
│ Kubernetes       ██░░░░░░░░  20%        │
│                                         │
├─────────────────────────────────────────┤
│ Recommended Projects                    │
│                                         │
│ • Containerized REST API                │
│ • Cloud Deployment Project              │
│                                         │
├─────────────────────────────────────────┤
│ Resume Progress                         │
│                                         │
│ V1 → V2 → V3 → V4                      │
│ 52% → 68% → 75% → 82%                  │
│                                         │
└─────────────────────────────────────────┘
```

---

# 30. MVP Development Plan

## Phase 1 — Foundation

```text
✓ Resume upload
✓ JD upload
✓ Text extraction
✓ Basic database
✓ Basic frontend
```

## Phase 2 — Core Agents

```text
✓ Supervisor Agent
✓ ATS Agent
✓ JD Analysis Agent
✓ Matching Agent
```

## Phase 3 — Skill Development

```text
✓ Skill Gap Agent
✓ Project Recommendation
✓ Learning Agent
✓ Resource validation
```

## Phase 4 — Resume Optimization

```text
✓ Resume Rewrite Agent
✓ JD-specific optimization
✓ Anti-fabrication constraints
```

## Phase 5 — Agentic Loop

```text
✓ Re-matching
✓ Score comparison
✓ Remaining gap detection
✓ Iterative workflow
```

## Phase 6 — History & Analytics

```text
✓ Resume versions
✓ Analysis history
✓ Progress tracking
✓ Version comparison
```

## Phase 7 — Final Product

```text
✓ Dashboard
✓ Authentication
✓ Error handling
✓ Agent monitoring
✓ Explainability
✓ Production deployment
```

---

# 31. Final System

The completed SkillGap AI system should provide:

```text
                    SKILLGAP AI
                         │
                         ▼
                SUPERVISOR AGENT
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
       ▼                 ▼                  ▼
    ATS Agent       JD Analysis        Matching Agent
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
                         ▼
                  Skill Gap Agent
                         │
                         ▼
                   Learning Agent
                         │
                         ▼
                Project Recommendations
                         │
                         ▼
                Resume Rewrite Agent
                         │
                         ▼
                    Re-Matching
                         │
                         ▼
                 Progress Analysis
                         │
                         ▼
                 Remaining Skill Gaps
                         │
                         └───────────────► LOOP
```

## Core Principle

> **SkillGap AI does not just tell a student what is wrong with their resume. It identifies what they need to improve, helps them learn it, guides them to build evidence, updates their resume, measures the improvement, and continues the process until the remaining gaps are minimized.**

---

# 32. One-Line Project Definition

**SkillGap AI is a Supervisor-driven multi-agent career optimization system that analyzes resumes and job descriptions, identifies explainable skill gaps, generates personalized learning and project pathways, optimizes resumes without fabrication, and iteratively improves JD alignment through an agentic feedback loop.**
