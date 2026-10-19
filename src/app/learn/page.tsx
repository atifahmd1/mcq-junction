import React from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getLearningQuestions } from "@/lib/concept/service";
import { LearningQuestionCard } from "@/components/learning/LearningQuestionCard";
import { LearningQuestionData } from "@/types/concept";
import { AdSlot } from "@/components/ads/AdSlot";

export const instant = false;

// Standard canonical demo questions matching the product design mockup
const DEMO_QUESTIONS: LearningQuestionData[] = [
  {
    occurrenceId: "demo-occ-bfs-queue",
    sequenceNumber: 12,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "TRE 4 (2024) - Shift 1",
    paperStatus: "PUBLISHED",
    primarySubject: "Data Structures & Algorithms",
    defaultTopic: "Graph Traversal & Queues",
    questionType: "SINGLE_CORRECT",
    questionText:
      "Which data structure is commonly used to implement Breadth-First Search (BFS)?",
    languageCode: "EN",
    options: [
      {
        id: "opt-bfs-stack",
        optionLabel: "A",
        optionText: "Stack",
        sortOrder: 1,
        isCorrect: false,
        explanationText: "A stack is used in Depth-First Search (DFS) for LIFO backtracking, not BFS.",
        conceptId: "concept-stack-dfs",
        concept: {
          id: "concept-stack-dfs",
          title: "Stack Data Structure & Depth-First Search",
          content:
            "A stack is a Last-In, First-Out (LIFO) linear collection. Depth-First Search uses a stack (or implicit recursive call stack) to visit successor nodes as deeply as possible before backtracking.\n\nBecause DFS explores subtrees immediately, it cannot guarantee shortest-path guarantees on unweighted graphs.",
          keyPoints: [
            "LIFO (Last In First Out) ordering",
            "Optimal for topological sort, cycle detection, and strongly connected components",
            "O(1) push and pop operations"
          ],
        },
      },
      {
        id: "opt-bfs-queue",
        optionLabel: "B",
        optionText: "Queue",
        sortOrder: 2,
        isCorrect: true,
        explanationText:
          "BFS uses a queue to explore vertices level by level because it follows the FIFO (First In First Out) principle.",
        conceptId: "concept-bfs-queue",
        concept: {
          id: "concept-bfs-queue",
          title: "Breadth-First Search (BFS) and Queue Mechanism",
          content:
            "Breadth-First Search (BFS) is a fundamental graph traversal algorithm that visits all neighbor nodes at the present depth level before moving on to nodes at subsequent depth levels.\n\nTo preserve this strict layer-by-layer traversal order, BFS utilizes a First-In, First-Out (FIFO) queue. When a node is dequeued, all its unvisited adjacent vertices are enqueued. In unweighted graphs, this guarantees the shortest path from the source vertex.",
          keyPoints: [
            "FIFO (First In First Out) queue guarantees level-order expansion",
            "Time complexity: O(V + E) where V is vertices and E is edges",
            "Guarantees minimum edge-distance paths in unweighted graphs",
            "Widely used in routing algorithms, web crawlers, and peer-to-peer networks"
          ],
          references: [
            {
              title: "CLRS Introduction to Algorithms — Chapter 22 (Elementary Graph Algorithms)",
              url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
              type: "BOOK",
            },
            {
              title: "Breadth-First Search Specification — GeeksforGeeks",
              url: "https://www.geeksforgeeks.org/breadth-first-search-or-bfs-for-a-graph/",
              type: "ARTICLE",
            }
          ],
        },
      },
      {
        id: "opt-bfs-tree",
        optionLabel: "C",
        optionText: "Tree",
        sortOrder: 3,
        isCorrect: false,
        explanationText:
          "A tree is an acyclic connected graph or data structure, not an auxiliary collection used to implement BFS.",
        conceptId: null,
        concept: null,
      },
      {
        id: "opt-bfs-graph",
        optionLabel: "D",
        optionText: "Graph",
        sortOrder: 4,
        isCorrect: false,
        explanationText:
          "A graph is the network structure being traversed, not the auxiliary data structure that coordinates visitation order.",
        conceptId: null,
        concept: null,
      },
    ],
    overallExplanation:
      "BFS explores vertices level by level because a FIFO queue preserves exact visitation sequence.",
  },
  {
    occurrenceId: "demo-occ-postgresql-relational",
    sequenceNumber: 1,

    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Database Management Systems",
    defaultTopic: "Relational Model & Architecture",
    questionType: "SINGLE_CORRECT",
    questionText:
      "Which of the following describes why PostgreSQL is categorized as a relational database management system (RDBMS)?",
    languageCode: "EN",
    options: [
      {
        id: "opt-a-relational",
        optionLabel: "A",
        optionText: "It stores data in structured tables with rows and columns, enforcing keys and ACID transactions.",
        sortOrder: 1,
        isCorrect: true,
        explanationText: "PostgreSQL organizes entities into relational tables with strict schemas and foreign key integrity.",
        conceptId: "concept-postgresql-relational",
        concept: {
          id: "concept-postgresql-relational",
          title: "Why is PostgreSQL a relational database?",
          content:
            "PostgreSQL is a relational database management system (RDBMS) that stores data in tables with rows and columns. It supports SQL, enforces relationships through keys and constraints, and provides ACID compliance, making it suitable for complex, structured data applications.\n\nRelational databases rely on relational algebra where each table represents a relation and each tuple represents an entity. Constraints such as primary keys, unique constraints, and foreign keys guarantee referential integrity across related tables.",
          keyPoints: [
            "Data is organized into tables (relations) with rows and columns",
            "Supports SQL for standard query and manipulation operations",
            "Uses primary and foreign keys to maintain relationships",
            "Ensures ACID properties (Atomicity, Consistency, Isolation, Durability)",
            "Widely used in web applications, analytics, and enterprise systems",
          ],
          imageUrl: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&auto=format&fit=crop&q=80",
          imageAlt: "Relational Database Structure with Students and Courses tables linked via course_id",
          imageCaption: "Relational Database Structure",
          videoUrl: "https://www.youtube.com/watch?v=qw--VYLpxG4",
          videoTitle: "Introduction to Relational Databases (8:24)",
          references: [
            {
              title: "Official PostgreSQL Documentation",
              url: "https://www.postgresql.org/docs/",
              type: "DOCUMENTATION",
            },
            {
              title: "What is a Relational Database?",
              url: "https://en.wikipedia.org/wiki/Relational_database",
              type: "ARTICLE",
            },
            {
              title: "ACID Properties Explained",
              url: "https://www.ibm.com/topics/acid",
              type: "SPECIFICATION",
            },
            {
              title: "PostgreSQL Architecture Guide",
              url: "https://www.postgresql.org/docs/current/tutorial-arch.html",
              type: "DOCUMENTATION",
            },
          ],
        },
      },
      {
        id: "opt-b-keyvalue",
        optionLabel: "B",
        optionText: "It operates strictly as a distributed key-value store optimized exclusively for in-memory caching.",
        sortOrder: 2,
        isCorrect: false,
        explanationText: "Key-value in-memory caching describes systems like Redis or Memcached, not the relational foundation of PostgreSQL.",
        conceptId: "concept-key-value-stores",
        concept: {
          id: "concept-key-value-stores",
          title: "Key-Value Stores vs Relational Databases",
          content:
            "Key-value stores associate discrete strings or byte sequences with unique keys. Unlike relational databases, key-value stores do not inherently support relational joins, foreign key constraints, or structured SQL queries.",
          keyPoints: [
            "Optimized for high-throughput single-key read/write operations",
            "Data structures are typically unindexed blobs or hash maps",
            "Examples include Redis, AWS DynamoDB, and Memcached",
          ],
          references: [
            {
              title: "Redis Documentation on Key-Value Data Structures",
              url: "https://redis.io/docs/data-types/",
              type: "DOCUMENTATION",
            },
          ],
        },
      },
      {
        id: "opt-c-learnmore",
        optionLabel: "C",
        optionText: "It stores documents purely as schemaless BSON objects without supporting SQL query syntax.",
        sortOrder: 3,
        isCorrect: false,
        // Notice: NO short explanation text, but has a detailed concept!
        // This tests Requirement 5: "If a detailed concept exists without a short explanation, provide a visible Learn More action."
        explanationText: null,
        conceptId: "concept-document-stores",
        concept: {
          id: "concept-document-stores",
          title: "Document Stores vs PostgreSQL JSONB",
          content:
            "Document databases store records as flexible JSON-like documents (such as MongoDB's BSON). While PostgreSQL supports high-performance JSONB storage and indexing, its primary architectural paradigm remains relational with strong typing and ACID transactional guarantees.",
          keyPoints: [
            "Document stores emphasize flexible, polymorphic schemas",
            "PostgreSQL bridges relational modeling and document storage via its native JSONB data type",
          ],
          references: [
            {
              title: "PostgreSQL JSON Types Documentation",
              url: "https://www.postgresql.org/docs/current/datatype-json.html",
              type: "DOCUMENTATION",
            },
          ],
        },
      },
      {
        id: "opt-d-no-concept",
        optionLabel: "D",
        optionText: "It uses graph traversal algorithms exclusively to model nodes and edges.",
        sortOrder: 4,
        isCorrect: false,
        // Notice: Has short explanation, but NO detailed concept!
        // This tests Requirement 1: "Make an option's short explanation clickable only when its associated detailed concept exists."
        // Short explanation must remain PLAIN TEXT and NOT clickable!
        explanationText: "Graph databases model networks of nodes and edges (e.g. Neo4j), which is distinct from PostgreSQL's relational core.",
        conceptId: null,
        concept: null,
      },
    ],
  },
  {
    occurrenceId: "demo-occ-quicksort-complexity",
    sequenceNumber: 2,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Data Structures & Algorithms",
    defaultTopic: "Sorting & Asymptotic Complexity",
    questionType: "SINGLE_CORRECT",
    questionText: "What is the worst-case time complexity of the standard QuickSort algorithm?",
    languageCode: "EN",
    options: [
      {
        id: "opt-qs-a",
        optionLabel: "A",
        optionText: "O(n log n)",
        sortOrder: 1,
        isCorrect: false,
        explanationText: "O(n log n) is the average-case and best-case time complexity, but not the worst case.",
        conceptId: null,
        concept: null,
      },
      {
        id: "opt-qs-b",
        optionLabel: "B",
        optionText: "O(n²)",
        sortOrder: 2,
        isCorrect: true,
        explanationText: "The worst-case occurs when the pivot partition is extremely unbalanced, such as an already sorted array.",
        conceptId: "concept-quicksort-worst-case",
        concept: {
          id: "concept-quicksort-worst-case",
          title: "QuickSort Worst-Case Complexity O(n²)",
          content:
            "QuickSort operates via a divide-and-conquer strategy by choosing a pivot element and partitioning the array around it.\n\nWhen the chosen pivot is repeatedly the extreme element (minimum or maximum), one partition has 0 elements and the other has n-1 elements. The recurrence relation becomes T(n) = T(n-1) + O(n), which solves to O(n²).\n\nRandomized pivot selection or the median-of-three heuristic is used in practice to avoid this worst-case scenario.",
          keyPoints: [
            "Standard pivot selection on sorted arrays yields O(n²) worst-case performance",
            "Recurrence relation in the worst case: T(n) = T(n-1) + cn = O(n²)",
            "Mitigated by randomized pivot selection or dual-pivot algorithms (like introsort)",
          ],
          references: [
            {
              title: "CLRS Introduction to Algorithms — Chapter 7 (Quicksort)",
              url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
              type: "BOOK",
            },
          ],
        },
      },
      {
        id: "opt-qs-c",
        optionLabel: "C",
        optionText: "O(n)",
        sortOrder: 3,
        isCorrect: false,
        explanationText: "Comparison-based sorting has a theoretical lower bound of Ω(n log n).",
        conceptId: null,
        concept: null,
      },
      {
        id: "opt-qs-d",
        optionLabel: "D",
        optionText: "O(log n)",
        sortOrder: 4,
        isCorrect: false,
        explanationText: null,
        conceptId: null,
        concept: null,
      },
    ],
  },
  {
    occurrenceId: "demo-occ-balanced-trees-multicorrect",
    sequenceNumber: 3,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Data Structures & Algorithms",
    defaultTopic: "Search Trees & Asymptotic Bounds",
    questionType: "MULTIPLE_CORRECT",
    questionText:
      "Which of the following data structures guarantee a worst-case search time complexity of O(log n)?",
    languageCode: "EN",
    options: [
      {
        id: "opt-mc-a",
        optionLabel: "A",
        optionText: "Standard Unsorted Array",
        sortOrder: 1,
        isCorrect: false,
        explanationText: "Linear search on an unsorted array requires O(n) worst-case time.",
      },
      {
        id: "opt-mc-b",
        optionLabel: "B",
        optionText: "Red-Black Self-Balancing Binary Search Tree",
        sortOrder: 2,
        isCorrect: true,
        explanationText:
          "Red-black trees maintain strict color invariants guaranteeing max height ≤ 2 log(n + 1), ensuring O(log n) worst-case search.",
      },
      {
        id: "opt-mc-c",
        optionLabel: "C",
        optionText: "Standard Hash Table with Chaining",
        sortOrder: 3,
        isCorrect: false,
        explanationText:
          "While average search is O(1), catastrophic hash collisions degrade worst-case lookup to O(n).",
      },
      {
        id: "opt-mc-d",
        optionLabel: "D",
        optionText: "B+ Tree Index Structure",
        sortOrder: 4,
        isCorrect: true,
        explanationText:
          "B+ trees maintain balanced page hierarchies where all leaf nodes reside at equal depth, guaranteeing O(log n) disc lookup.",
      },
    ],
    overallExplanation:
      "Options B and D are self-balancing multi-way or binary structures guaranteeing worst-case logarithmic search O(log n).",
  },
  {
    occurrenceId: "demo-occ-fk-integrity-assertion-reason",
    sequenceNumber: 4,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Database Management Systems",
    defaultTopic: "Relational Integrity & Foreign Keys",
    questionType: "ASSERTION_REASON",
    questionText:
      "Given the statements below regarding PostgreSQL relational integrity, select the correct evaluation:",
    assertionText:
      "Foreign key constraints prevent orphaned child rows by ensuring referenced primary key or unique values exist in the parent table.",
    reasonText:
      "PostgreSQL enforces referential integrity during DML operations, aborting transactions with foreign key violation errors when parent rows do not match.",
    languageCode: "EN",
    options: [
      {
        id: "opt-ar-a",
        optionLabel: "A",
        optionText:
          "Both Assertion (A) and Reason (R) are true and Reason (R) is the correct explanation of Assertion (A).",
        sortOrder: 1,
        isCorrect: true,
        explanationText:
          "Reason (R) accurately explains how PostgreSQL guarantees referential integrity at transaction boundaries.",
      },
      {
        id: "opt-ar-b",
        optionLabel: "B",
        optionText:
          "Both Assertion (A) and Reason (R) are true but Reason (R) is NOT the correct explanation of Assertion (A).",
        sortOrder: 2,
        isCorrect: false,
        explanationText:
          "Reason (R) directly explains the transactional validation mechanism behind Assertion (A).",
      },
      {
        id: "opt-ar-c",
        optionLabel: "C",
        optionText: "Assertion (A) is true but Reason (R) is false.",
        sortOrder: 3,
        isCorrect: false,
        explanationText:
          "Reason (R) is true; PostgreSQL executes constraint checks at statement or commit time.",
      },
      {
        id: "opt-ar-d",
        optionLabel: "D",
        optionText: "Assertion (A) is false but Reason (R) is true.",
        sortOrder: 4,
        isCorrect: false,
        explanationText:
          "Assertion (A) is true; preventing orphaned rows is the foundational purpose of foreign keys.",
      },
    ],
    overallExplanation:
      "Both Assertion and Reason are true, and the transactional enforcement of constraints explains how referential integrity is preserved.",
  },
  // 5. Comprehension Passage Linked Question 1 (English)
  {
    occurrenceId: "demo-occ-passage-cap-1",
    sequenceNumber: 5,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Distributed Systems",
    defaultTopic: "CAP Theorem & Partition Tolerance",
    questionType: "SINGLE_CORRECT",
    passage: {
      id: "passage-cap-theorem",
      passageRefCode: "PASSAGE-CS-01",
      title: "The CAP Theorem and Distributed Consistency",
      bodyText:
        "In theoretical computer science, the CAP theorem (also known as Brewer's theorem) states that any distributed data store can simultaneously provide at most two of the following three guarantees: Consistency (every read receives the most recent write or an error), Availability (every non-failing node returns a response for every request without guarantee that it contains the most recent write), and Partition Tolerance (the system continues to operate despite an arbitrary number of messages being dropped or delayed by the network between nodes).\n\nBecause physical network partitions (P) are unavoidable in real-world distributed architectures due to link cuts, switch failures, or packet latency, a distributed data store must explicitly choose between Consistency and Availability when a partition occurs (yielding either CP or AP systems).",
      languageCode: "EN",
      imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80",
      imageAlt: "Distributed Server Cluster Architecture",
    },
    questionText:
      "According to the passage, why must real-world distributed database systems fundamentally choose between Consistency and Availability (CP vs AP)?",
    languageCode: "EN",
    options: [
      {
        id: "opt-cap1-a",
        optionLabel: "A",
        optionText: "Network partitions (P) are physically unavoidable across distributed networks.",
        sortOrder: 1,
        isCorrect: true,
        explanationText: "Link cuts, packet latency, and hardware network partitions are inevitable in physical infrastructure.",
      },
      {
        id: "opt-cap1-b",
        optionLabel: "B",
        optionText: "Modern hardware completely eliminates the risk of dropped or delayed network packets.",
        sortOrder: 2,
        isCorrect: false,
        explanationText: "The passage explicitly states physical network partitions are unavoidable in real-world networks.",
      },
      {
        id: "opt-cap1-c",
        optionLabel: "C",
        optionText: "ACID properties cannot be implemented on any single-node database management system.",
        sortOrder: 3,
        isCorrect: false,
        explanationText: "The passage concerns distributed data stores across network partitions, not single-node ACID capabilities.",
      },
      {
        id: "opt-cap1-d",
        optionLabel: "D",
        optionText: "Relational algebra forbids the replication of relational tables across data centers.",
        sortOrder: 4,
        isCorrect: false,
        explanationText: "Relational algebra has no restriction on distributed replication.",
      },
    ],
    overallExplanation:
      "Because network partitions (P) cannot be prevented in physical networks, distributed systems must trade off Consistency (CP) or Availability (AP) during a partition event.",
  },
  // 6. Comprehension Passage Linked Question 2 (Same passage, Multiple-Correct with B & D correct)
  {
    occurrenceId: "demo-occ-passage-cap-2",
    sequenceNumber: 6,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "Distributed Systems",
    defaultTopic: "CAP Theorem Guarantees",
    questionType: "MULTIPLE_CORRECT",
    passage: {
      id: "passage-cap-theorem",
      passageRefCode: "PASSAGE-CS-01",
      title: "The CAP Theorem and Distributed Consistency",
      bodyText:
        "In theoretical computer science, the CAP theorem (also known as Brewer's theorem) states that any distributed data store can simultaneously provide at most two of the following three guarantees: Consistency (every read receives the most recent write or an error), Availability (every non-failing node returns a response for every request without guarantee that it contains the most recent write), and Partition Tolerance (the system continues to operate despite an arbitrary number of messages being dropped or delayed by the network between nodes).\n\nBecause physical network partitions (P) are unavoidable in real-world distributed architectures due to link cuts, switch failures, or packet latency, a distributed data store must explicitly choose between Consistency and Availability when a partition occurs (yielding either CP or AP systems).",
      languageCode: "EN",
      imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80",
      imageAlt: "Distributed Server Cluster Architecture",
    },
    questionText:
      "Based on Brewer's CAP theorem described in the passage, which of the following guarantees are explicitly defined? (Select all correct options)",
    languageCode: "EN",
    options: [
      {
        id: "opt-cap2-a",
        optionLabel: "A",
        optionText: "Automatic schema migration across disparate SQL and NoSQL databases.",
        sortOrder: 1,
        isCorrect: false,
        explanationText: "Schema migration is an operational tooling feature, not one of the three CAP guarantees.",
      },
      {
        id: "opt-cap2-b",
        optionLabel: "B",
        optionText: "Consistency: Every read request receives the most recent write or an error.",
        sortOrder: 2,
        isCorrect: true,
        explanationText: "Consistency in CAP guarantees linearizable reads reflecting the latest acknowledged write.",
      },
      {
        id: "opt-cap2-c",
        optionLabel: "C",
        optionText: "Zero-latency transactional commits guaranteed regardless of geographic distance.",
        sortOrder: 3,
        isCorrect: false,
        explanationText: "Speed of light and network latency prevent zero-latency cross-datacenter commits.",
      },
      {
        id: "opt-cap2-d",
        optionLabel: "D",
        optionText: "Availability: Every non-failing node returns a response for every request without failing.",
        sortOrder: 4,
        isCorrect: true,
        explanationText: "Availability in CAP requires every healthy node to answer requests without returning partition errors.",
      },
    ],
    overallExplanation:
      "The three guarantees of the CAP theorem are Consistency (B), Availability (D), and Partition Tolerance.",
  },
  // 7. Comprehension Passage Linked Question 3 (Urdu script with RTL formatting)
  {
    occurrenceId: "demo-occ-passage-urdu-1",
    sequenceNumber: 7,
    paperId: "demo-paper-bpsc-cs",
    paperTitle: "BPSC TRE Computer Science (Class 11-12)",
    paperStatus: "PUBLISHED",
    primarySubject: "کمپیوٹر سائنس (Computer Science)",
    defaultTopic: "ڈیٹا بیس مینجمنٹ سسٹم (DBMS)",
    questionType: "SINGLE_CORRECT",
    passage: {
      id: "passage-urdu-dbms",
      passageRefCode: "PASSAGE-UR-01",
      title: "ڈیٹا بیس مینجمنٹ سسٹم اور اس کی اہمیت",
      bodyText:
        "ڈیٹا بیس مینجمنٹ سسٹم (DBMS) ایک ایسا سافٹ ویئر سسٹم ہے جو ڈیٹا کو منظم، محفوظ اور موثر طریقے سے محفوظ کرنے اور بازیافت کرنے کے لیے استعمال ہوتا ہے۔ رشتہ دار ڈیٹا بیس (RDBMS) میں ڈیٹا کو جدولوں (Tables) کی شکل میں قطاروں اور کالموں میں رکھا جاتا ہے۔ ہر جدول میں ایک پرائمری کلید (Primary Key) ہوتی ہے جو ہر ریکارڈ کی انفرادیت کو یقینی بناتی ہے۔ غیر ملکی کلید (Foreign Key) کے ذریعے دو جدولوں کے درمیان تعلق قائم کیا جاتا ہے تاکہ ڈیٹا کی درستگی اور سالمیت برقرار رہے۔",
      languageCode: "UR",
    },
    questionText:
      "مندرجہ بالا اقتباس کے مطابق، جدول (Table) میں ہر ریکارڈ کی انفرادیت کو یقینی بنانے کے لیے کیا استعمال ہوتا ہے؟",
    languageCode: "UR",
    options: [
      {
        id: "opt-ur-a",
        optionLabel: "A",
        optionText: "پرائمری کلید (Primary Key)",
        sortOrder: 1,
        isCorrect: true,
        explanationText: "پرائمری کلید ہر ریکارڈ کی مکمل انفرادیت کو یقینی بناتی ہے۔",
      },
      {
        id: "opt-ur-b",
        optionLabel: "B",
        optionText: "عارضی فائل (Temporary File)",
        sortOrder: 2,
        isCorrect: false,
        explanationText: "عارضی فائلیں ڈیٹا ریکارڈ کی انفرادیت فراہم نہیں کرتیں۔",
      },
      {
        id: "opt-ur-c",
        optionLabel: "C",
        optionText: "کیشے میموری (Cache Memory)",
        sortOrder: 3,
        isCorrect: false,
        explanationText: "کیشے میموری محض تیز رفتار رسائی کے لیے استعمال ہوتی ہے۔",
      },
      {
        id: "opt-ur-d",
        optionLabel: "D",
        optionText: "نیٹ ورک روٹر (Network Router)",
        sortOrder: 4,
        isCorrect: false,
        explanationText: "نیٹ ورک روٹر ایک ہارڈویئر نیٹ ورکنگ ڈیوائس ہے۔",
      },
    ],
    overallExplanation:
      "اقتباس میں واضح طور پر بیان کیا گیا ہے کہ پرائمری کلید ہر ریکارڈ کی انفرادیت کو یقینی بناتی ہے۔",
  },
];

export default async function LearnPage() {
  await connection();

  // Try to load any published questions from the real database
  let dbQuestions: LearningQuestionData[] = [];
  try {
    dbQuestions = await getLearningQuestions({ limit: 5 });
  } catch (err) {
    console.error("Database query for learning questions failed:", err);
  }

  // Merge database questions with standard canonical questions for comprehensive learning
  const questionsToDisplay = [
    ...DEMO_QUESTIONS,
    ...dbQuestions.filter(
      (dbQ) => !DEMO_QUESTIONS.some((demoQ) => demoQ.occurrenceId === dbQ.occurrenceId)
    ),
  ];

  return (
    <main className="min-h-screen bg-[#0B0D0F] text-[#F1F2F3] py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Breadcrumb & Header Section */}
        <div className="space-y-3">
          <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
            <Link href="/" className="hover:text-[#F1F2F3] transition">
              Home
            </Link>
            <span>/</span>
            <Link href="/exams" className="hover:text-[#F1F2F3] transition">
              Practice
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#D6B36A]">Learning Mode</span>
          </nav>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D6B36A]/15 border border-[#D6B36A]/30 px-3 py-0.5 text-xs font-semibold text-[#D6B36A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D6B36A]" />
                  Active Learning Mode
                </span>
                <span className="text-xs text-[#717780]">
                  Immediate Feedback &bull; Deep Conceptual Analysis
                </span>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F1F2F3]">
                Practice &amp; Conceptual Mastery
              </h1>
            </div>

            <Link
              href="/exams"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#D6B36A]/40 transition"
            >
              <span>Full Mock Tests</span>
              <span>&rarr;</span>
            </Link>
          </div>

          <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed max-w-2xl">
            Select an answer to trigger instant server-authoritative evaluation. Explore detailed concept breakdowns, verified references, and algorithmic walkthroughs.
          </p>
        </div>

        {/* Question Cards Stack */}
        <div className="space-y-8">
          {questionsToDisplay.map((question) => (
            <LearningQuestionCard
              key={question.occurrenceId}
              question={question}
              initialSelectedOptionId={null}
            />
          ))}
        </div>

        {/* Prepared Architectural Ad Slot after complete learning explanations */}
        <AdSlot placement="post_explanation" slotId="ad-post-learn-explanation" />
      </div>
    </main>
  );
}

