// src/components/WriteOnly.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useRole } from '@/hooks/useRole';

export default function WriteOnly({ children }) {
  const { loading, canWrite } = useRole();

  if (loading || !canWrite) return null;

  return <>{children}</>;
}

WriteOnly.propTypes = {
  children: PropTypes.node.isRequired,
};
