<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class PreventDuplicateSubmission
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $body = $request->except(['_token']);
        ksort($body);
        $hash     = md5($user->id . '|' . $request->path() . '|' . json_encode($body));
        $cacheKey = 'dup:' . $hash;

        if (Cache::has($cacheKey)) {
            return response()->json(
                ['message' => 'Duplicate submission detected. This record may have already been saved.'],
                409
            );
        }

        $response = $next($request);

        if ($response->getStatusCode() >= 200 && $response->getStatusCode() < 300) {
            Cache::put($cacheKey, 1, 10); // 10-second lock after success
        }

        return $response;
    }
}
