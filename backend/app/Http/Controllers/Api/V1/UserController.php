<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreUserRequest;
use App\Http\Requests\Api\V1\UpdateUserRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class UserController extends Controller
{
    private const FIELDS = ['id', 'name', 'email', 'role', 'location_id', 'is_active'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', User::class);
        $paginator = User::orderBy('name')->paginate(50);
        $arr = $paginator->toArray();

        return response()->json([
            'data' => array_map(fn ($u) => collect($u)->only(self::FIELDS)->all(), $arr['data']),
            'meta' => [
                'current_page' => $arr['current_page'],
                'last_page' => $arr['last_page'],
                'per_page' => $arr['per_page'],
                'total' => $arr['total'],
            ],
        ]);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::create($request->validated());

        return response()->json(['data' => $user->only(self::FIELDS)], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);
        $user->update($request->validated());

        return response()->json(['data' => $user->fresh()->only(self::FIELDS)]);
    }
}
