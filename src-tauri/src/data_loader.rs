use anyhow::{Context, Result};
use rand::seq::SliceRandom;
use rand::thread_rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordItem {
    pub id: u64,
    pub word: String,
    pub phonetic: String,
    pub part_of_speech: String,
    pub level: String,
    pub meaning_ar: String,
    pub definition_en: String,
    pub example: String,
    pub example_ar: String,
    pub synonyms: Vec<String>,
    #[serde(default)]
    pub antonyms: Vec<String>,
    #[serde(default)]
    pub topic: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizOption {
    pub id: u64,
    pub text: String,
    pub is_correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizQuestion {
    pub word_id: u64,
    pub question_type: String, // "meaning_to_word" or "word_to_meaning"
    pub prompt: String,
    pub target_word: String,
    pub target_phonetic: String,
    pub target_meaning: String,
    pub options: Vec<QuizOption>,
}

pub struct DataLoader {
    words: Vec<WordItem>,
}

#[allow(dead_code)]
impl DataLoader {
    pub fn load_from_path(path: PathBuf) -> Result<Self> {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read words from {:?}", path))?;
        let words: Vec<WordItem> = serde_json::from_str(&content)
            .with_context(|| "Failed to parse oxford_words.json")?;
        log::info!("Loaded {} English words from {:?}", words.len(), path);
        Ok(Self { words })
    }

    pub fn total_count(&self) -> usize {
        self.words.len()
    }

    pub fn all_words(&self) -> &[WordItem] {
        &self.words
    }

    pub fn words_for_level(&self, level: &str) -> Vec<WordItem> {
        if level.eq_ignore_ascii_case("All") || level.is_empty() {
            self.words.clone()
        } else {
            self.words
                .iter()
                .filter(|w| w.level.eq_ignore_ascii_case(level))
                .cloned()
                .collect()
        }
    }

    pub fn get_by_id(&self, id: u64) -> Option<WordItem> {
        self.words.iter().find(|w| w.id == id).cloned()
    }

    pub fn get_word_at(&self, level: &str, index: usize) -> Option<(WordItem, usize, usize)> {
        let list = self.words_for_level(level);
        if list.is_empty() {
            return None;
        }
        let total = list.len();
        let safe_idx = index % total;
        Some((list[safe_idx].clone(), safe_idx, total))
    }

    pub fn search(&self, query: &str, level: Option<&str>) -> Vec<WordItem> {
        let q = query.trim().to_lowercase();
        let list = if let Some(lvl) = level {
            self.words_for_level(lvl)
        } else {
            self.words.clone()
        };

        if q.is_empty() {
            return list;
        }

        list.into_iter()
            .filter(|w| {
                w.word.to_lowercase().contains(&q)
                    || w.meaning_ar.to_lowercase().contains(&q)
                    || w.definition_en.to_lowercase().contains(&q)
                    || w.topic.to_lowercase().contains(&q)
            })
            .collect()
    }

    pub fn generate_quiz(&self, level: Option<&str>) -> Option<QuizQuestion> {
        let pool = if let Some(lvl) = level {
            let filtered = self.words_for_level(lvl);
            if filtered.len() >= 4 {
                filtered
            } else {
                self.words.clone()
            }
        } else {
            self.words.clone()
        };

        if pool.len() < 4 {
            return None;
        }

        let mut rng = thread_rng();
        let target = pool.choose(&mut rng)?.clone();

        // Pick 3 distractors
        let mut distractors: Vec<&WordItem> = pool.iter().filter(|w| w.id != target.id).collect();
        distractors.shuffle(&mut rng);
        let distractors = &distractors[..3];

        // Randomly choose question style: 50% Word -> Arabic Meaning, 50% Arabic Meaning -> Word
        let is_word_to_meaning = rand::random::<bool>();

        let mut options = Vec::new();
        if is_word_to_meaning {
            options.push(QuizOption {
                id: target.id,
                text: target.meaning_ar.clone(),
                is_correct: true,
            });
            for d in distractors {
                options.push(QuizOption {
                    id: d.id,
                    text: d.meaning_ar.clone(),
                    is_correct: false,
                });
            }
            options.shuffle(&mut rng);

            Some(QuizQuestion {
                word_id: target.id,
                question_type: "word_to_meaning".to_string(),
                prompt: format!("ما معنى كلمة: {}", target.word),
                target_word: target.word,
                target_phonetic: target.phonetic,
                target_meaning: target.meaning_ar,
                options,
            })
        } else {
            options.push(QuizOption {
                id: target.id,
                text: target.word.clone(),
                is_correct: true,
            });
            for d in distractors {
                options.push(QuizOption {
                    id: d.id,
                    text: d.word.clone(),
                    is_correct: false,
                });
            }
            options.shuffle(&mut rng);

            Some(QuizQuestion {
                word_id: target.id,
                question_type: "meaning_to_word".to_string(),
                prompt: format!("اختر الكلمة الإنجليزية المناسبة لـ: {}", target.meaning_ar),
                target_word: target.word,
                target_phonetic: target.phonetic,
                target_meaning: target.meaning_ar,
                options,
            })
        }
    }
}
