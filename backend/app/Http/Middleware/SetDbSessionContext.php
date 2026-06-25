<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class SetDbSessionContext
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = Auth::guard('sanctum')->user();

        $userId = (string) ($user !== null ? $user->id : 0);
        $role = $user !== null ? ($user->role ?? 'guest') : 'guest';
        $locationIds = $user !== null && $user->location_id !== null
            ? json_encode([$user->location_id])
            : '[]';

        try {
            DB::statement('SELECT set_config(?, ?, false)', ['app.user_id', $userId]);
            DB::statement('SELECT set_config(?, ?, false)', ['app.role', $role]);
            DB::statement('SELECT set_config(?, ?, false)', ['app.location_ids', $locationIds]);

            return $next($request);
        } finally {
            try {
                DB::unprepared('RESET app.user_id');
                DB::unprepared('RESET app.role');
                DB::unprepared('RESET app.location_ids');
            } catch (\Throwable) {
                // Connection may be closed or in error state
            }
        }
    }
}
