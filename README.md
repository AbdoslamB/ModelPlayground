# Model Playground

Learn machine learning by moving things. Every model is a small lab: drag, slide and click, and the graph, the equation and the numbers change together.

Live site (after launch): https://abdoslamb.github.io/ModelPlayground/

**Status:** all eleven models are ready: Linear Regression, k-Nearest Neighbors, k-Means, Naive Bayes, Decision Tree, Random Forest, Support Vector Machine, Q-Learning, t-SNE, Recurrent Neural Network and Deep Q-Network. Each has a Lab (graph, equation and table), a short explanation of the model, and a "Try it in Python" section: the Lab's current state as a short program (with scikit-learn or NumPy, and by hand) that runs in the browser with [Pyodide](https://pyodide.org) and prints the Lab's numbers.

## Run it locally

Needs Node 22.12 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:4321/ModelPlayground/. To see exactly what GitHub Pages will serve:

```sh
npm run build
npm run preview
```

## Test

```sh
npm run check            # types (Astro, Svelte, TypeScript)
npm run lint             # ESLint + stylelint
npm test                 # unit and property tests (math against scikit-learn)
npm run build && npm run test:e2e   # end-to-end tests in real browsers
npm run size             # bundle budgets, after a build
```

End-to-end tests need the Playwright browsers: `npx playwright install chromium webkit`. The Python programs' unit tests run them with your local Python, and are skipped without it; the scikit-learn and NumPy ones need the libraries in `python/requirements.txt`.

## Regenerate the data

The data is made up but realistic, generated with a fixed seed, so nothing is downloaded or copyrighted.

```sh
pip install -r python/requirements.txt
python python/prepare_data.py   # writes src/models/*/data/*.json (batches of 10 points)
python python/make_fixtures.py  # scikit-learn reference results for the tests
python python/k_nearest_neighbors.py  # k-NN fruit data and its scikit-learn checks
python python/k_means.py  # k-Means park data and its scikit-learn checks
python python/naive_bayes.py  # Naive Bayes messages and scikit-learn's chances
python python/decision_tree.py  # Decision Tree beach days and scikit-learn's trees
python python/random_forest.py  # Random Forest seeds, its forests, checked with scikit-learn
python python/support_vector_machine.py  # SVM students and scikit-learn's SVC results
python python/q_learning.py  # Q-Learning mazes, training replays and value iteration
python python/t_sne.py  # t-SNE pictures, checked piece by piece with scikit-learn
python python/recurrent_neural_network.py  # trains the small RNN (numpy) and writes its weights
python python/deep_q_network.py  # DQN fields, and training replays the page must match
```

With an embedded Python that has no `venv`, install into the project instead with `pip install --target .pydeps -r python/requirements.txt`. The scripts find it automatically.

## How it is built

A static [Astro](https://astro.build) site with one [Svelte](https://svelte.dev) island per model page. Every model plugs into a shared Lab shell with three linked views: an interactive graph, a live equation and a data table. Every number on a page comes from the model's tested `math.ts`, checked against scikit-learn.
