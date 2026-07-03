/**
 * Ollama Setup Optimization Utility
 * Reduces token overhead and improves local model response times.
 */

/**
 * Strips previously generated large analysis data from the candidate profile JSON.
 * Helps fit the candidate profile into smaller model contexts and decreases prompt processing time.
 * @param {Object} profile - The candidate profile object or document.
 * @returns {Object} A cleaned clone of the candidate profile.
 */
export function compressCandidateProfile(profile) {
  if (!profile) return profile;
  
  let cleanProfile;
  if (typeof profile.toObject === 'function') {
    cleanProfile = profile.toObject();
  } else {
    try {
      cleanProfile = JSON.parse(JSON.stringify(profile));
    } catch (e) {
      cleanProfile = { ...profile };
    }
  }

  const keysToStrip = [
    'interviewQuestions',
    'hrQuestions',
    'technicalQuestions',
    'career_gaps',
    'technical_depth_audit',
    'domain_question_bank',
    'project_deep_dive',
    'hr_questions',
    'red_flags',
    'must_prepare_topics',
    'fit_summary'
  ];

  for (const key of keysToStrip) {
    if (key in cleanProfile) {
      delete cleanProfile[key];
    }
  }

  return cleanProfile;
}

/**
 * Recursively strips `description` keys from JSON schema objects to save token overhead.
 * @param {Object} schema - The JSON schema object.
 * @returns {Object} A cloned schema with description fields removed.
 */
export function stripSchemaDescriptions(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  let cleanSchema;
  try {
    cleanSchema = JSON.parse(JSON.stringify(schema));
  } catch (e) {
    return schema;
  }

  function recurse(obj) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        recurse(item);
      }
    } else {
      if ('description' in obj) {
        delete obj.description;
      }
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          recurse(obj[key]);
        }
      }
    }
  }

  recurse(cleanSchema);
  return cleanSchema;
}
