import React, { Suspense } from 'react';
import ReactDOM from 'react-dom';

import { fetchProfileData } from './fakeApi';

const resource = fetchProfileData();

export default function ProfilePage() {
  return (
    <Suspense fallback={<h1>Loading profile...</h1>}>
      <ProfileDetails />
      <span>1111111111</span>
      <Suspense fallback={<h1>Loading posts...</h1>}>
        <ProfileTimeline />
      </Suspense>
    </Suspense>
  );
}

function ProfileDetails() {
  // Try to read user info, although it might not have loaded yet
  const user = resource.user.read();
  return <h1>{user.name}</h1>;
}

function ProfileTimeline() {
  // Try to read posts, although they might not have loaded yet
  const posts = resource.posts.read();
  return (
    <ul>
      {posts.map((post: any) => (
        <li key={post.id}>{post.text}</li>
      ))}
    </ul>
  );
}

