<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreNewsRequest;
use App\Http\Requests\Api\V1\UpdateNewsRequest;
use App\Models\News;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NewsController extends Controller
{
    private const FIELDS = ['id', 'title', 'body', 'created_by', 'is_published', 'published_at', 'created_at'];

    public function index(Request $request): JsonResponse
    {
        $isAdmin = $request->user()->role === 'admin';

        $news = News::when(! $isAdmin, fn ($q) => $q->where('is_published', true))
            ->latest()
            ->paginate(20);

        return response()->json($news->through(fn ($n) => $n->only(self::FIELDS)));
    }

    public function store(StoreNewsRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $news = News::create([
            'title' => $validated['title'],
            'body' => $validated['body'],
            'is_published' => $validated['is_published'] ?? false,
            'published_at' => ($validated['is_published'] ?? false) ? now() : null,
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $news->only(self::FIELDS)], 201);
    }

    public function show(Request $request, News $news): JsonResponse
    {
        if (! $news->is_published && $request->user()->role !== 'admin') {
            abort(403, 'News article is not published.');
        }

        return response()->json(['data' => $news->only(self::FIELDS)]);
    }

    public function update(UpdateNewsRequest $request, News $news): JsonResponse
    {
        $validated = $request->validated();

        if (isset($validated['is_published']) && $validated['is_published'] && ! $news->published_at) {
            $validated['published_at'] = now();
        }

        $news->update($validated);

        return response()->json(['data' => $news->fresh()->only(self::FIELDS)]);
    }

    public function destroy(News $news): JsonResponse
    {
        $this->authorize('delete', $news);
        $news->delete();

        return response()->json(['message' => 'News article deleted']);
    }
}
