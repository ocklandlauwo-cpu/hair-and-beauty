<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetDbSessionContext
{
    public function handle(Request $request, Closure $next): Response
    {
        // Phase 2: SET LOCAL app.user_id, app.role, app.location_ids GUCs
        // and RESET them in finally block for RLS enforcement.
        return $next($request);
    }
}
