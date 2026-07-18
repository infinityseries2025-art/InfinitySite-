#!/bin/bash
# Setup script for Firebase deployment
# Run this in Cloud Shell after uploading files

# Create public directory
mkdir -p public/assets/css
mkdir -p public/assets/js

# Copy HTML files
cp index.html public/
cp matches.html public/
cp rankings.html public/
cp tournaments.html public/
cp news.html public/
cp contacts.html public/
cp admin.html public/
cp match-details.html public/
cp player-profile.html public/
cp team-profile.html public/

# Copy config files
cp firebase.json public/
cp .firebaserc public/
cp config.js public/
cp firestore.rules public/
cp logo.jpg public/

# Copy assets
cp assets/css/style.css public/assets/css/
cp assets/js/firebase-config.js public/assets/js/
cp assets/js/main.js public/assets/js/

echo "Deployment files copied to public/ folder"
echo "Now run: firebase deploy --only hosting"
