import Anthropic from "@anthropic-ai/sdk";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const client = new Anthropic();

const WORDPRESS_URL = process.env.WORDPRESS_URL || "https://gujaratmirror.in";
const WORDPRESS_USER = process.env.WORDPRESS_USER || "admin";
const WORDPRESS_PASSWORD = process.env.WORDPRESS_PASSWORD;

async function fetchArticleContent(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $("h1, .headline, .title").first().text().trim();
    const content = $("article, .content, .post-content, main")
      .text()
      .trim()
      .slice(0, 3000);

    return {
      title: title || "Article",
      content: content || "Unable to extract content",
    };
  } catch (error) {
    return {
      title: "Article",
      content: "Unable to fetch the article. Please provide the content manually.",
    };
  }
}

async function generateGujaratiContent(englishTitle, englishContent) {
  const message = await client.messages.create({
    model: "claude-opus-4-20250805",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Convert this English news article to Gujarati. Provide ONLY the response in the exact JSON format below, no other text:

English Title: ${englishTitle}
English Content: ${englishContent}

Response format (valid JSON only):
{
  "gujaratiTitle": "ગુજરાતી શીર્ષક",
  "gujaratiContent": "ગુજરાતી સામગ્રી...",
  "keywords": "keyword1, keyword2, keyword3",
  "metaDescription": "Short description for search results",
  "slug": "english-slug-format"
}`,
      },
    ],
  });

  try {
    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Invalid JSON format");
  } catch (error) {
    return {
      gujaratiTitle: "લેખ",
      gujaratiContent: "સામગ્રી",
      keywords: "news, article",
      metaDescription: "Article translated to Gujarati",
      slug: "article",
    };
  }
}

async function publishToWordPress(
  title,
  content,
  excerpt,
  slug,
  tags,
  keywords
) {
  const auth = Buffer.from(`${WORDPRESS_USER}:${WORDPRESS_PASSWORD}`).toString(
    "base64"
  );

  const wordPressContent = `${content}\n\nKeywords: ${keywords}`;

  const postData = {
    title: title,
    content: wordPressContent,
    excerpt: excerpt,
    slug: slug,
    status: "publish",
    tags: tags,
  };

  try {
    const response = await fetch(
      `${WORDPRESS_URL}/wp-json/wp/v2/posts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(postData),
      }
    );

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      postId: result.id,
      url: result.link,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { articleUrl, manualTitle, manualContent, action } = req.body;

  if (action === "fetch") {
    if (!articleUrl) {
      return res.status(400).json({ error: "Article URL required" });
    }

    const article = await fetchArticleContent(articleUrl);
    const gujarati = await generateGujaratiContent(
      article.title,
      article.content
    );

    return res.status(200).json({
      success: true,
      englishTitle: article.title,
      englishContent: article.content.slice(0, 500),
      ...gujarati,
    });
  }

  if (action === "publish") {
    if (!manualTitle || !manualContent) {
      return res.status(400).json({ error: "Title and content required" });
    }

    if (!WORDPRESS_PASSWORD) {
      return res.status(500).json({
        error: "WordPress password not configured in environment",
      });
    }

    const gujarati = await generateGujaratiContent(
      manualTitle,
      manualContent
    );

    const result = await publishToWordPress(
      gujarati.gujaratiTitle,
      gujarati.gujaratiContent,
      gujarati.metaDescription,
      gujarati.slug,
      [gujarati.keywords.split(",")[0]],
      gujarati.keywords
    );

    return res.status(200).json(result);
  }

  return res.status(400).json({ error: "Invalid action" });
}
