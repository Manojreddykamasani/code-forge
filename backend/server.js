require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const supabase=require("./supabase.js")
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";
const TOGETHER_API_KEY = 'tgp_v1_7H6rlv1Ow3Yf5UCn8E1ugW-shqYD9AnVOvF9XIA-lsw';

app.post("/submit", async (req, res) => {
  try {
    const { language, version, source_code, testCases, user_id, question_id } = req.body;

    if (!language || !source_code || !testCases || !user_id || !question_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let results = [];
    let passedCount = 0;

    for (const testCase of testCases) {
      const response = await axios.post("https://emkc.org/api/v2/piston/execute", {
        language,
        version,
        files: [{ content: source_code }],
        stdin: testCase.input
      });

      const output = response.data.run.output.trim();
      const expected = testCase.output.trim();

      const passed = output === expected;
      if (passed) passedCount++;

      results.push({ input: testCase.input, output, expected, passed });
    }

    const allPassed = passedCount === testCases.length;

    // ✅ If all test cases passed, insert into solved_questions
    if (allPassed) {
      const { data, error } = await supabase
        .from("solved_questions")
        .insert([{ user_id, question_id }]);

      if (error) {
        return res.status(500).json({ error: "Failed to store solved question", details: error });
      }
    }

    res.status(200).json({
      passedCount,
      total: testCases.length,
      allPassed,
      results
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});


app.post("/analyze", async (req, res) => {
  const {
    code,
    language,
    question,
    testResults,
    attempts,
    timeSpentInSeconds,
    previousWeaknesses,
    user_id, // Make sure to send user_id in request body
  } = req.body;

  const isFirst = !previousWeaknesses || previousWeaknesses.length === 0;

  const prompt = `
  You are an expert coding mentor helping analyze student code.

  Here is a coding problem:
  - Title: ${question.title}
  - Description: ${question.description}
  - Constraints: ${question.constraints}

  Student wrote this code in ${language}:
  \\\`${language}
  ${code}
  \\\`

  Here are the test case results:
  ${testResults
    .map(
      (r, i) =>
        `Test ${i + 1}: input = ${r.input}, expected = ${r.expected_output}, actual = ${r.actual_output}, passed = ${r.passed}`
    )
    .join("\n")}

  Additional metadata:
  - Number of attempts: ${attempts}
  - Time spent: ${timeSpentInSeconds} seconds

  ${
    isFirst
      ? "This is the user's first question."
      : `The student had the following previous weaknesses:\n- ${previousWeaknesses.join(
          "\n- "
        )}\nEvaluate whether these have been improved upon. Add any new weaknesses if found.`
  }

  Analyze the student's code:
  1. Identify mistakes.
  2. Suggest improvements.
  3. Mention any new or persistent weaknesses.
  4. Return a JSON response in the format:
     {
       "feedback": "Detailed feedback here...",
       "weaknesses": ["weakness1", "weakness2"]
     }
  `;

  try {
    const response = await axios.post(
      "https://api.together.xyz/v1/chat/completions",
      {
        model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that only replies in JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const text = response.data.choices[0].message.content;
    const jsonStart = text.indexOf("{");
    const jsonString = text.slice(jsonStart);

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (err) {
      console.error("Failed to parse AI response:", err.message);
      return res
        .status(500)
        .json({ error: "Failed to parse AI response", raw: text });
    }

    const extractedWeaknesses = analysis.weaknesses || [];
    try {
      const { data, error } = await supabase
        .from("weakness")
        .upsert([{ user_id, weaknesses: extractedWeaknesses }], {
          onConflict: ["user_id"],
        });

      if (error) {
        console.error("Error inserting weaknesses:", error.message);
      } else {
        console.log("Weaknesses saved:", data);
      }
    } catch (err) {
      console.error("Unexpected Supabase error:", err.message);
    }

    return res.json(analysis);
  } catch (error) {
    console.error("Error in /analyze:", error.message);
    return res.status(500).json({ error: error.message });
  }
});


// The subtopic flow
const SUBTOPIC_FLOW = [
  'Array Traversal',
  'Hash Map',
  'Sorting',
  'Binary Search',
  'Dynamic Programming',
  'Matrix',
  'Two Pointers',
  'Math',
  'Prefix Product',
  'Quickselect',
  'Deque',
  'Greedy',
  'Graph',
  'Union Find',
  'BFS',
  'DFS',
  'Topological Sort',
  'Backtracking',
  'Array Manipulation'
];

app.post('/generate-question', async (req, res) => {
  const user_id = req.body.user_id;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    // Step 1: Get the count of solved questions for the user
    const { count: solvedCount, error: countError } = await supabase
      .from('solved_questions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    if (countError) throw countError;

    // Step 2: Set the difficulty based on the number of solved questions
    let difficulty = 1;
    if (solvedCount > 15) {
      difficulty = 3;
    } else if (solvedCount > 10) {
      difficulty = 2;
    }

    // Step 3: Fetch questions of the selected difficulty
    const { data: questions, error: fetchError } = await supabase
      .from('questions')
      .select('*')
      .eq('difficulty', difficulty);

    if (fetchError) throw fetchError;
    if (!questions || questions.length === 0) {
      return res.status(404).json({ error: 'No questions found for selected difficulty' });
    }

    // Step 4: Get list of solved questions for the user
    const { data: solvedQuestions, error: solvedError } = await supabase
      .from('solved_questions')
      .select('question_id')
      .eq('user_id', user_id);

    if (solvedError) throw solvedError;

    // Step 5: Filter out solved questions
    const solvedQuestionIds = solvedQuestions.map((solved) => solved.question_id);
    const unsolvedQuestions = questions.filter((question) => !solvedQuestionIds.includes(question.id));

    if (unsolvedQuestions.length === 0) {
      return res.status(404).json({ error: 'No unsolved questions available for this difficulty' });
    }

    // Step 6: Randomly pick a question from the unsolved questions
    const randomIndex = Math.floor(Math.random() * unsolvedQuestions.length);
    const randomQuestion = unsolvedQuestions[randomIndex];

    res.json({ question: randomQuestion });
  } catch (error) {
    console.error("Error in /generate-question:", error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
