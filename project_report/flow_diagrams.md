# TasmiqAI System Flow Diagrams

This document contains the professional system flow diagrams for the **Student Mobile Application** and **Teacher Web Portal**.

---

## 1. Student Mobile Application Flow

```mermaid
flowchart TD
    A[Login] --> B[Dashboard]
    B --> C[Select Class / Enter Class Code]
    C --> D{Choose Module}
    D -->|Option A| E[Murajaah Mode]
    D -->|Option B| F[Tasmiq Exercise - AI Practice]
    D -->|Option C| G[Official Tasmiq Assessment]
    
    E --> H[Record by Ayah]
    F --> H
    G --> H
    
    H --> I[Review & Playback Recordings]
    I --> J[Submit to System / Teacher]
    J --> K[Teacher Review & Evaluation]
    K --> L[Receive Push Notification]
    L --> M[View Audio History & Comparisons]
    M --> N[View Student Progress & Reports]
```

---

## 2. Teacher Web Portal Flow

```mermaid
flowchart TD
    A[Teacher Login] --> B[Educator Dashboard]
    B --> C[Tasmiq Workspace]
    C --> D{Select Workspace Tab}
    
    D -->|Tab 1| E[Exercise Records - AI Practice]
    D -->|Tab 2| F[Official Assessment - Teacher Evaluation]
    
    E --> G[View AI Scores, Diagnostics & Audio]
    
    F --> H[Listen to Recitation Audio]
    H --> I{Teacher Decision}
    
    I -->|PASS| J[Approve Assessment]
    I -->|REPEAT| K[Request Re-recording with Comments]
    
    J --> L[Automated Notification Sent to Student]
    K --> L
    
    L --> M[Generate Reports & PDF Summaries]
    M --> N[View Analytics & Student Progress]
```

---

## Summary of Flow Enhancements

1. **Auto-Join Class**: Enrollment approval steps have been removed. Valid class codes enroll students directly.
2. **Ayah-by-Ayah Recording**: Recitations are recorded and evaluated individually per ayah, providing precise audio playback controls (Play, Pause, Replay, Loop, and Sequential Playback).
3. **Teacher Decision Flow**: The teacher workspace explicitly separates AI Practice Exercises from Official Teacher Assessments (where AI percentage is hidden and teachers decide PASS or REPEAT with instant student notifications).
