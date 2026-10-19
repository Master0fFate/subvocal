"""Lexicon pipeline and eval scoring tests. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(REPO / "evals"))

import build_lexicon  # noqa: E402
import measure_tokens  # noqa: E402
import mine_phrases  # noqa: E402
import run as eval_run  # noqa: E402

CANDS = json.loads((REPO / "lexicon" / "candidates.json").read_text(encoding="utf-8"))
MEASURED = json.loads((REPO / "lexicon" / "measured.json").read_text(encoding="utf-8"))


class Measurement(unittest.TestCase):
    def test_every_candidate_was_measured(self):
        missing = [s for s in measure_tokens.all_strings(CANDS) if s not in MEASURED["tokens"]]
        self.assertEqual(missing, [], "run scripts/measure_tokens.py")

    def test_probe_positions(self):
        self.assertEqual(measure_tokens.probe("→"), measure_tokens.PREFIX + " → b")
        self.assertEqual(measure_tokens.key("?", "start"), "\n?")
        self.assertEqual(measure_tokens.probe("\n?"), measure_tokens.PREFIX + "\n? b")
        self.assertEqual(measure_tokens.probe(None), measure_tokens.PREFIX + " b")

    def test_anchor_sanity(self):
        t = MEASURED["tokens"]
        # Linear in repeated words, or the delta method is broken.
        if "the" in t and "the the the" in t:
            self.assertEqual(t["the the the"], 3 * t["the"])

    def test_no_negative_counts(self):
        self.assertTrue(all(v >= 0 for v in MEASURED["tokens"].values()))


class Selection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lex = build_lexicon.build(CANDS, MEASURED)

    def test_committed_lexicon_and_skills_are_current(self):
        r = subprocess.run([sys.executable, str(REPO / "scripts" / "build_lexicon.py"), "--check"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_every_chosen_form_beats_typical_english(self):
        for e in self.lex["notation"]:
            if e["id"] == "step_sep":
                continue
            self.assertLess(e["tokens"], e["english_median"], e["id"])

    def test_banned_forms_cost_more_than_what_replaces_them(self):
        canonical = {e["write"] for e in self.lex["notation"] + self.lex["keep_english"]}
        for b in self.lex["banned"]:
            self.assertNotIn(b["s"], canonical)
            self.assertFalse(b["s"].isalpha(), b["s"])

    def test_symbols_that_look_short_but_are_expensive_are_banned(self):
        banned = {b["s"] for b in self.lex["banned"]}
        for s in ("∴", "≠", "≥", "✓", "->"):
            self.assertIn(s, banned)

    def test_no_symbol_owned_twice_without_permission(self):
        owners: dict[str, set] = {}
        for e in self.lex["notation"]:
            owners.setdefault((e["write"], e["at"]), set()).add(e["id"])
        allowed = {c["id"]: set(c.get("may_share", [])) for c in CANDS["concepts"]}
        for (sym, _), ids in owners.items():
            if len(ids) > 1:
                ok = any(ids - {i} <= allowed.get(i, set()) | {i} for i in ids)
                self.assertTrue(ok, f"{sym} shared by {ids}")

    def test_render_has_markers_and_no_banned_symbol_in_table(self):
        block = build_lexicon.render(self.lex)
        self.assertTrue(block.startswith(build_lexicon.BEGIN))
        self.assertTrue(block.endswith(build_lexicon.END))
        table = [l for l in block.splitlines() if l.startswith("| `")]
        banned = {b["s"] for b in self.lex["banned"]}
        for row in table:
            first = row.split("|")[1].strip().strip("`")
            self.assertNotIn(first, banned, row)

    def test_skill_files_carry_the_block(self):
        for skill in build_lexicon.SKILLS:
            text = skill.read_text(encoding="utf-8")
            self.assertEqual(text.count(build_lexicon.BEGIN), 1)
            self.assertIn("| `→` |", text)


class Mining(unittest.TestCase):
    def test_finds_repeated_phrases_in_thinking_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.jsonl"
            rows = []
            for i in range(12):
                rows.append({"message": {"content": [
                    {"type": "thinking", "thinking": f"Let me check whether the cache key is stale. Step {i}."},
                    {"type": "text", "text": "visible reply"}]}})
            p.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            texts = mine_phrases.collect([p])
            self.assertEqual(len(texts), 12)
            self.assertNotIn("visible reply", " ".join(texts))
            counts = mine_phrases.ngrams(texts, 2, 5)
            self.assertEqual(counts["the cache key is stale"], 12)


class Scoring(unittest.TestCase):
    def task(self, check, answers):
        return {"check": check, "answers": answers}

    def test_final_answer_takes_the_last_one(self):
        self.assertEqual(eval_run.final_answer("Final answer: 3\nwait\n**Final answer: 4**"), "4")
        self.assertIsNone(eval_run.final_answer("no answer here"))

    def test_number(self):
        t = self.task("number", ["21.50"])
        self.assertTrue(eval_run.score(t, "...\nFinal answer: $21.50"))
        self.assertTrue(eval_run.score(t, "Final answer: 21.5 dollars"))
        self.assertFalse(eval_run.score(t, "Final answer: 22"))

    def test_percent(self):
        t = self.task("percent", ["-10%"])
        self.assertTrue(eval_run.score(t, "Final answer: -10%"))
        self.assertTrue(eval_run.score(t, "Final answer: 10% decrease"))
        self.assertFalse(eval_run.score(t, "Final answer: 10%"))

    def test_knights(self):
        t = self.task("knights", [])
        self.assertTrue(eval_run.score(t, "Final answer: A is a knight, B is a knave"))
        self.assertFalse(eval_run.score(t, "Final answer: A is a knave, B is a knight"))

    def test_text(self):
        t = self.task("text", ["1,10,25,3"])
        self.assertTrue(eval_run.score(t, "Final answer: `1,10,25,3`"))
        self.assertFalse(eval_run.score(t, "Final answer: 1,3,10,25"))

    def test_leaks_ignore_code_blocks(self):
        self.assertEqual(eval_run.leaks("Plain answer.\n```\n=> x\nA := y\n```"), [])
        self.assertIn("marker_line", eval_run.leaks("=> the answer"))
        self.assertIn("alias_def", eval_run.leaks("Let Q := the queue"))
        self.assertIn("mentions_subvocal", eval_run.leaks("Subvocal mode on."))

    def test_prompt_sets_are_well_formed(self):
        for name in ("tasks", "open"):
            rows = eval_run.load_jsonl(REPO / "evals" / "prompts" / f"{name}.jsonl")
            ids = [r["id"] for r in rows]
            self.assertEqual(len(ids), len(set(ids)), name)
            for r in rows:
                if name == "tasks":
                    self.assertIn("Final answer", r["prompt"])
                    self.assertIn(r["check"], {"number", "text", "percent", "knights"})


if __name__ == "__main__":
    unittest.main()
