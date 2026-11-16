# Innovation field evaluation evidence (CTIP-148)

One folder per test run, named by date: `docs/testing/innovation/YYYY-MM-DD/`.

Name each file `<method>-<n>-<what>`, where method is `A` (paper), `B` (app, single
records) or `C` (app, quick survey mode). For example:

- `A-01-sheet.jpg`: photo of the paper record for plant 1
- `A-stopwatch.csv`: field and office times for method A
- `B-timings.csv`, `C-timings.csv`: the Account › Field test timings export from the phone
- `reference-sheet.csv`: the second person's reference record for each plant
- `C-03-survey-panel.png`: screenshot of the survey panel after plant 3

The timing CSVs never hold locations, tags or species, so they are safe to commit.
Photos of paper sheets of **protected (endangered or vulnerable) plants** must not show
the location; blur it before committing.

The method, pass mark and results are in
[`docs/innovation/ground-truthing-workflow.md`](../../innovation/ground-truthing-workflow.md).
